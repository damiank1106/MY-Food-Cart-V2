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
} from '@/services/supabase';

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'offline';

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

  const triggerSyncInternal = useCallback(async (checkPending: (online: boolean) => Promise<void>): Promise<boolean> => {
    if (isSyncing.current) {
      console.log('Sync already in progress, skipping...');
      return false;
    }

    if (!isSupabaseConfigured()) {
      console.log('Supabase not configured, skipping sync');
      return false;
    }

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      console.log('No network connection, skipping sync');
      setSyncStatus('offline');
      return false;
    }

    isSyncing.current = true;
    setSyncStatus('syncing');
    console.log('Starting full sync to Supabase...');

    try {
      for (const deletion of pendingDeletions.current) {
        await deleteFromSupabase(deletion.table, deletion.id);
      }
      pendingDeletions.current = [];

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

      const results = await Promise.all([
        pendingUsers.length > 0 ? syncUsersToSupabase(pendingUsers) : true,
        pendingCategories.length > 0 ? syncCategoriesToSupabase(pendingCategories) : true,
        pendingInventory.length > 0 ? syncInventoryToSupabase(pendingInventory) : true,
        pendingSales.length > 0 ? syncSalesToSupabase(pendingSales) : true,
        pendingExpenses.length > 0 ? syncExpensesToSupabase(pendingExpenses) : true,
        pendingActivities.length > 0 ? syncActivitiesToSupabase(pendingActivities) : true,
      ]);

      const allSuccess = results.every(r => r);
      
      if (allSuccess) {
        await markAllSynced();
        setPendingCount(0);
        setSyncStatus('synced');
        setLastSyncTime(new Date());
        console.log('Sync completed successfully');
        return true;
      } else {
        console.log('Some sync operations failed');
        setSyncStatus('pending');
        await checkPending(true);
        return false;
      }
    } catch (error) {
      console.log('Sync error:', error);
      setSyncStatus('pending');
      await checkPending(true);
      return false;
    } finally {
      isSyncing.current = false;
    }
  }, []);

  const checkPendingCount = useCallback(async () => {
    await checkPendingCountInternal(isOnline);
  }, [checkPendingCountInternal, isOnline]);

  const triggerSync = useCallback(async (): Promise<boolean> => {
    return triggerSyncInternal(checkPendingCountInternal);
  }, [triggerSyncInternal, checkPendingCountInternal]);

  useEffect(() => {
    checkPendingCountInternal(true);
    
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected ?? false;
      console.log('Network state changed:', online ? 'online' : 'offline');
      setIsOnline(online);
      
      if (online && !isSyncing.current) {
        triggerSyncInternal(checkPendingCountInternal);
      }
    });

    return () => unsubscribe();
  }, [checkPendingCountInternal, triggerSyncInternal]);

  const queueDeletion = useCallback((table: string, id: string) => {
    pendingDeletions.current.push({ table, id });
    checkPendingCount();
  }, [checkPendingCount]);

  const syncBeforeLogout = useCallback(async (): Promise<boolean> => {
    console.log('Syncing before logout...');
    const result = await triggerSync();
    return result;
  }, [triggerSync]);

  return {
    syncStatus,
    pendingCount,
    isOnline,
    lastSyncTime,
    triggerSync,
    checkPendingCount,
    queueDeletion,
    syncBeforeLogout,
  };
});
