import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  getUsers,
  getCategories,
  getInventory,
  getSales,
  getExpenses,
  getActivities,
  getPendingSyncCount,
  markAllSynced,
  upsertUsersFromServer,
  upsertCategoriesFromServer,
  upsertInventoryFromServer,
  upsertSalesFromServer,
  upsertExpensesFromServer,
  upsertActivitiesFromServer,
  repairDuplicateCategories,
  migrateLocalUserIdsToServerIds,
  resolveUserPinConflict,
} from '@/services/database';
import {
  isSupabaseConfigured,
  syncUsersToSupabase,
  syncCategoriesToSupabase,
  syncInventoryToSupabase,
  syncSalesToSupabase,
  syncExpensesToSupabase,
  syncActivitiesToSupabase,
  deleteFromSupabase,
  fetchUsersFromSupabase,
  fetchCategoriesFromSupabase,
  fetchInventoryFromSupabase,
  fetchSalesFromSupabase,
  fetchExpensesFromSupabase,
  fetchActivitiesFromSupabase,
  findUserByPinInSupabase,
} from '@/services/supabase';

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'offline';

export type SyncReason = 'login' | 'logout' | 'manual' | 'auto';

const DEVELOPER_PIN = '2345';
const LAST_SYNC_TIME_KEY = '@myfoodcart_last_sync_time';

interface PendingDeletion {
  table: string;
  id: string;
}

export const [SyncProvider, useSync] = createContextHook(() => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const isSyncing = useRef(false);
  const pendingDeletions = useRef<PendingDeletion[]>([]);

  const checkPendingCountInternal = useCallback(async (online: boolean) => {
    const count = await getPendingSyncCount();
    setPendingCount(count);
    
    if (count > 0) {
      setSyncStatus('pending');
    } else if (online) {
      setSyncStatus('synced');
    }
  }, []);

  const triggerFullSync = useCallback(async (options?: { reason: SyncReason }): Promise<{ ok: boolean }> => {
    const reason = options?.reason || 'auto';
    console.log(`Starting full bi-directional sync (reason: ${reason})...`);

    if (isSyncing.current) {
      console.log('Sync already in progress, skipping...');
      return { ok: false };
    }

    if (!isSupabaseConfigured()) {
      console.log('Supabase not configured, setting status to pending');
      setSyncStatus('pending');
      return { ok: false };
    }

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      console.log('No network connection, setting status to offline');
      setSyncStatus('offline');
      return { ok: false };
    }

    isSyncing.current = true;
    setSyncStatus('syncing');

    try {
      console.log('Fetching server users for ID migration...');
      const serverUsers = await fetchUsersFromSupabase();
      
      if (serverUsers && serverUsers.length > 0) {
        console.log(`Server users fetched: ${serverUsers.length}`);
        await migrateLocalUserIdsToServerIds({
          serverUsers: serverUsers.map(u => ({ id: u.id, pin: u.pin, role: u.role, name: u.name })),
          fallbackPin: DEVELOPER_PIN,
        });
      } else {
        console.log('No server users found, skipping migration');
      }

      console.log('Running pre-sync database repair...');
      await repairDuplicateCategories();

      console.log('Processing pending deletions...');
      for (const deletion of pendingDeletions.current) {
        await deleteFromSupabase(deletion.table, deletion.id);
      }
      pendingDeletions.current = [];

      console.log('Fetching local data...');
      const [users, categories, inventory, sales, expenses, activities] = await Promise.all([
        getUsers(),
        getCategories(),
        getInventory(),
        getSales(),
        getExpenses(),
        getActivities(),
      ]);

      let pendingUsers = users.filter(u => u.syncStatus === 'pending');
      const pendingCategories = categories.filter(c => c.syncStatus === 'pending');
      const pendingInventory = inventory.filter(i => i.syncStatus === 'pending');
      const pendingSales = sales.filter(s => s.syncStatus === 'pending');
      const pendingExpenses = expenses.filter(e => e.syncStatus === 'pending');
      const pendingActivities = activities.filter(a => a.syncStatus === 'pending');

      console.log(`Pushing pending changes: ${pendingUsers.length} users, ${pendingCategories.length} categories, ${pendingInventory.length} inventory, ${pendingSales.length} sales, ${pendingExpenses.length} expenses, ${pendingActivities.length} activities`);

      let pushSuccess = true;

      if (pendingUsers.length > 0) {
        console.log('Resolving user PIN conflicts before push...');
        const usersToSkip = new Set<string>();
        
        for (const localUser of pendingUsers) {
          try {
            const serverUser = await findUserByPinInSupabase(localUser.pin);
            if (serverUser && serverUser.id !== localUser.id) {
              console.log(`PIN conflict detected: local ${localUser.id} vs server ${serverUser.id} for PIN ${localUser.pin}`);
              await resolveUserPinConflict(localUser.id, serverUser.id, localUser);
              usersToSkip.add(localUser.id);
            }
          } catch (error) {
            console.log(`Error checking PIN conflict for user ${localUser.id}:`, error);
          }
        }
        
        pendingUsers = pendingUsers.filter(u => !usersToSkip.has(u.id));
        
        if (pendingUsers.length > 0) {
          console.log(`Pushing ${pendingUsers.length} users (${usersToSkip.size} resolved via PIN conflict)...`);
          const result = await syncUsersToSupabase(pendingUsers);
          if (!result) pushSuccess = false;
        } else {
          console.log(`All ${usersToSkip.size} pending users resolved via PIN conflict, none to push`);
        }
      }

      if (pendingCategories.length > 0) {
        console.log('Pushing categories...');
        const result = await syncCategoriesToSupabase(pendingCategories);
        if (!result) pushSuccess = false;
      }

      if (pendingInventory.length > 0) {
        console.log('Pushing inventory...');
        const result = await syncInventoryToSupabase(pendingInventory);
        if (!result) pushSuccess = false;
      }

      if (pendingSales.length > 0) {
        console.log('Pushing sales...');
        const result = await syncSalesToSupabase(pendingSales);
        if (!result) pushSuccess = false;
      }

      if (pendingExpenses.length > 0) {
        console.log('Pushing expenses...');
        const result = await syncExpensesToSupabase(pendingExpenses);
        if (!result) pushSuccess = false;
      }

      if (pendingActivities.length > 0) {
        console.log('Pushing activities...');
        const result = await syncActivitiesToSupabase(pendingActivities);
        if (!result) pushSuccess = false;
      }

      console.log(`Push completed: ${pushSuccess ? 'success' : 'some failures'}`);

      console.log('Pulling data from Supabase...');
      const [
        serverCategories,
        serverInventory,
        serverSales,
        serverExpenses,
        serverActivities,
      ] = await Promise.all([
        fetchCategoriesFromSupabase(),
        fetchInventoryFromSupabase(),
        fetchSalesFromSupabase(),
        fetchExpensesFromSupabase(),
        fetchActivitiesFromSupabase(),
      ]);

      console.log(`Pulled from server: ${serverUsers?.length || 0} users, ${serverCategories?.length || 0} categories, ${serverInventory?.length || 0} inventory, ${serverSales?.length || 0} sales, ${serverExpenses?.length || 0} expenses, ${serverActivities?.length || 0} activities`);

      if (serverUsers) await upsertUsersFromServer(serverUsers);
      if (serverCategories) await upsertCategoriesFromServer(serverCategories);
      if (serverInventory) await upsertInventoryFromServer(serverInventory);
      if (serverSales) await upsertSalesFromServer(serverSales);
      if (serverExpenses) await upsertExpensesFromServer(serverExpenses);
      if (serverActivities) await upsertActivitiesFromServer(serverActivities);

      if (pushSuccess) {
        await markAllSynced();
      }

      const newPendingCount = await getPendingSyncCount();
      setPendingCount(newPendingCount);
      const syncSucceeded = pushSuccess && newPendingCount === 0;

      if (syncSucceeded) {
        const completedAt = new Date();
        setLastSyncTime(completedAt);
        await AsyncStorage.setItem(LAST_SYNC_TIME_KEY, completedAt.toISOString());
      }

      if (newPendingCount === 0) {
        setSyncStatus('synced');
        console.log('Full sync completed successfully - all synced');
      } else {
        setSyncStatus('pending');
        console.log(`Full sync completed - ${newPendingCount} items still pending`);
      }

      return { ok: syncSucceeded };
    } catch (error) {
      console.log('Full sync error:', error);
      await checkPendingCountInternal(true);
      return { ok: false };
    } finally {
      isSyncing.current = false;
    }
  }, [checkPendingCountInternal]);

  const checkPendingCount = useCallback(async () => {
    await checkPendingCountInternal(isOnline);
  }, [checkPendingCountInternal, isOnline]);

  useEffect(() => {
    let isMounted = true;

    const loadLastSyncTime = async () => {
      try {
        const stored = await AsyncStorage.getItem(LAST_SYNC_TIME_KEY);
        if (!stored) return;

        const parsed = new Date(stored);
        if (!Number.isNaN(parsed.getTime()) && isMounted) {
          setLastSyncTime(parsed);
        }
      } catch (error) {
        console.log('Error loading last sync time:', error);
      }
    };

    loadLastSyncTime();

    return () => {
      isMounted = false;
    };
  }, []);

  const triggerSync = useCallback(async (): Promise<boolean> => {
    const result = await triggerFullSync({ reason: 'manual' });
    return result.ok;
  }, [triggerFullSync]);

  useEffect(() => {
    checkPendingCountInternal(true);
    
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected ?? false;
      console.log('Network state changed:', online ? 'online' : 'offline');
      setIsOnline(online);
      
      if (!online) {
        setSyncStatus('offline');
      } else if (!isSyncing.current) {
        triggerFullSync({ reason: 'auto' });
      }
    });

    return () => unsubscribe();
  }, [checkPendingCountInternal, triggerFullSync]);

  const queueDeletion = useCallback((table: string, id: string) => {
    pendingDeletions.current.push({ table, id });
    checkPendingCount();
  }, [checkPendingCount]);

  const syncBeforeLogout = useCallback(async (): Promise<boolean> => {
    console.log('Syncing before logout...');
    const result = await triggerFullSync({ reason: 'logout' });
    return result.ok;
  }, [triggerFullSync]);

  return {
    syncStatus,
    pendingCount,
    isOnline,
    lastSyncTime,
    triggerSync,
    triggerFullSync,
    checkPendingCount,
    queueDeletion,
    syncBeforeLogout,
  };
});
