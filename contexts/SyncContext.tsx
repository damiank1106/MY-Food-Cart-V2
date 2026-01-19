import createContextHook from '@nkzw/create-context-hook';
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
} from '@/services/supabase';

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'offline';

export type SyncReason = 'login' | 'logout' | 'manual' | 'auto';

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

      const pendingUsers = users.filter(u => u.syncStatus === 'pending');
      const pendingCategories = categories.filter(c => c.syncStatus === 'pending');
      const pendingInventory = inventory.filter(i => i.syncStatus === 'pending');
      const pendingSales = sales.filter(s => s.syncStatus === 'pending');
      const pendingExpenses = expenses.filter(e => e.syncStatus === 'pending');
      const pendingActivities = activities.filter(a => a.syncStatus === 'pending');

      console.log(`Pushing pending changes: ${pendingUsers.length} users, ${pendingCategories.length} categories, ${pendingInventory.length} inventory, ${pendingSales.length} sales, ${pendingExpenses.length} expenses, ${pendingActivities.length} activities`);

      const pushResults = await Promise.all([
        pendingUsers.length > 0 ? syncUsersToSupabase(pendingUsers) : true,
        pendingCategories.length > 0 ? syncCategoriesToSupabase(pendingCategories) : true,
        pendingInventory.length > 0 ? syncInventoryToSupabase(pendingInventory) : true,
        pendingSales.length > 0 ? syncSalesToSupabase(pendingSales) : true,
        pendingExpenses.length > 0 ? syncExpensesToSupabase(pendingExpenses) : true,
        pendingActivities.length > 0 ? syncActivitiesToSupabase(pendingActivities) : true,
      ]);

      const pushSuccess = pushResults.every(r => r);
      console.log(`Push completed: ${pushSuccess ? 'success' : 'some failures'}`);

      console.log('Pulling data from Supabase...');
      const [
        serverUsers,
        serverCategories,
        serverInventory,
        serverSales,
        serverExpenses,
        serverActivities,
      ] = await Promise.all([
        fetchUsersFromSupabase(),
        fetchCategoriesFromSupabase(),
        fetchInventoryFromSupabase(),
        fetchSalesFromSupabase(),
        fetchExpensesFromSupabase(),
        fetchActivitiesFromSupabase(),
      ]);

      console.log(`Pulled from server: ${serverUsers?.length || 0} users, ${serverCategories?.length || 0} categories, ${serverInventory?.length || 0} inventory, ${serverSales?.length || 0} sales, ${serverExpenses?.length || 0} expenses, ${serverActivities?.length || 0} activities`);

      await Promise.all([
        serverUsers ? upsertUsersFromServer(serverUsers) : Promise.resolve(),
        serverCategories ? upsertCategoriesFromServer(serverCategories) : Promise.resolve(),
        serverInventory ? upsertInventoryFromServer(serverInventory) : Promise.resolve(),
        serverSales ? upsertSalesFromServer(serverSales) : Promise.resolve(),
        serverExpenses ? upsertExpensesFromServer(serverExpenses) : Promise.resolve(),
        serverActivities ? upsertActivitiesFromServer(serverActivities) : Promise.resolve(),
      ]);

      if (pushSuccess) {
        await markAllSynced();
      }

      const newPendingCount = await getPendingSyncCount();
      setPendingCount(newPendingCount);
      setLastSyncTime(new Date());

      if (newPendingCount === 0) {
        setSyncStatus('synced');
        console.log('Full sync completed successfully - all synced');
      } else {
        setSyncStatus('pending');
        console.log(`Full sync completed - ${newPendingCount} items still pending`);
      }

      return { ok: pushSuccess && newPendingCount === 0 };
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
