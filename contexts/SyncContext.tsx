import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { OutboxEntityType, OutboxItem } from '@/types';
import {
  getUsers,
  getCategories,
  getInventory,
  getSales,
  getExpenses,
  getActivities,
  getPendingSyncCount,
  getOutboxItems,
  enqueueDeletion,
  markAllSynced,
  removeOutboxItem,
  updateOutboxItemStatus,
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

export type SyncReason =
  | 'login'
  | 'logout'
  | 'manual'
  | 'auto'
  | 'auto_add_sale'
  | 'auto_add_expense'
  | 'weekly_overview_refresh';

const DEVELOPER_PIN = '2345';
const LAST_SYNC_TIME_KEY = '@myfoodcart_last_sync_time';

type DeletionTable = 'users' | 'categories' | 'inventory' | 'sales' | 'expenses' | 'activities';

type SyncContextValue = {
  syncStatus: SyncStatus;
  isSyncing: boolean;
  uiSyncActive: boolean;
  pendingCount: number;
  isOnline: boolean;
  lastSyncTime: Date | null;
  syncNow: (options?: { reason?: SyncReason }) => Promise<{ ok: boolean }>;
  triggerSync: () => Promise<boolean>;
  triggerFullSync: (options?: { reason: SyncReason }) => Promise<{ ok: boolean }>;
  checkPendingCount: () => Promise<void>;
  queueDeletion: (
    entityType: DeletionTable,
    id: string,
    metadata?: { name?: string; amount?: number | null; date?: string | null }
  ) => Promise<void>;
  syncBeforeLogout: () => Promise<boolean>;
  resetSyncState: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const supabaseConfigured = isSupabaseConfigured();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [uiSyncActive, setUiSyncActive] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const isSyncingRef = useRef(false);
  const needsResync = useRef(false);
  const hasActiveSessionRef = useRef(false);
  const isOnlineRef = useRef(true);
  const pendingCountRef = useRef(0);
  const syncStatusRef = useRef<SyncStatus>('synced');

  const setSyncStatusStable = useCallback((nextStatus: SyncStatus) => {
    if (syncStatusRef.current === nextStatus) {
      return;
    }
    syncStatusRef.current = nextStatus;
    setSyncStatus(nextStatus);
  }, []);

  const setPendingCountStable = useCallback((nextCount: number) => {
    if (pendingCountRef.current === nextCount) {
      return;
    }
    pendingCountRef.current = nextCount;
    setPendingCount(nextCount);
  }, []);

  const setUiSyncActiveStable = useCallback((nextValue: boolean) => {
    setUiSyncActive(prev => (prev === nextValue ? prev : nextValue));
  }, []);

  const setIsSyncingStable = useCallback((nextValue: boolean) => {
    setIsSyncing(prev => (prev === nextValue ? prev : nextValue));
  }, []);

  const shouldUseUiSyncActive = useCallback((reason: SyncReason) => {
    return reason === 'manual' || reason === 'auto_add_sale' || reason === 'auto_add_expense' || reason === 'weekly_overview_refresh';
  }, []);

  const checkPendingCountInternal = useCallback(async (online: boolean) => {
    if (!hasActiveSessionRef.current) {
      setPendingCountStable(0);
      setSyncStatusStable(online ? 'synced' : 'offline');
      return;
    }

    const count = await getPendingSyncCount();
    setPendingCountStable(count);

    if (isSyncingRef.current) {
      setSyncStatusStable('syncing');
    } else if (count > 0) {
      setSyncStatusStable('pending');
    } else if (online) {
      setSyncStatusStable('synced');
    }
  }, [setPendingCountStable, setSyncStatusStable]);

  const triggerFullSync = useCallback(async (options?: { reason: SyncReason }): Promise<{ ok: boolean }> => {
    const reason = options?.reason || 'auto';
    const trackUiSync = shouldUseUiSyncActive(reason);

    console.log(`Starting full bi-directional sync (reason: ${reason})...`);

    if (!hasActiveSessionRef.current) {
      console.log('No active session, skipping sync');
      return { ok: false };
    }

    if (isSyncingRef.current) {
      console.log('Sync already in progress, skipping...');
      needsResync.current = true;
      return { ok: false };
    }

    if (trackUiSync) {
      setUiSyncActiveStable(true);
    }

    if (!isSupabaseConfigured()) {
      console.log('Supabase not configured, setting status to pending');
      setSyncStatusStable('pending');
      if (trackUiSync) {
        setUiSyncActiveStable(false);
      }
      return { ok: false };
    }

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      console.log('No network connection, setting status to offline');
      setSyncStatusStable('offline');
      if (trackUiSync) {
        setUiSyncActiveStable(false);
      }
      return { ok: false };
    }

    isSyncingRef.current = true;
    setIsSyncingStable(true);
    setSyncStatusStable('syncing');

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

      let pushSuccess = true;

      console.log('Processing pending deletions...');
      const pendingDeletions = (await getOutboxItems())
        .filter(item => item.operation === 'delete')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      for (const deletion of pendingDeletions) {
        if (deletion.operation !== 'delete') {
          continue;
        }

        const table = (() => {
          switch (deletion.entityType) {
            case 'sale':
              return 'sales';
            case 'expense':
              return 'expenses';
            case 'inventory':
              return 'inventory';
            case 'category':
              return 'categories';
            case 'user':
              return 'users';
            case 'activity':
              return 'activities';
            default:
              return null;
          }
        })();

        if (!table) {
          await updateOutboxItemStatus(deletion.id, 'failed');
          pushSuccess = false;
          continue;
        }

        await updateOutboxItemStatus(deletion.id, 'in_progress');
        const deleted = await deleteFromSupabase(table, deletion.entityId);
        if (deleted) {
          await removeOutboxItem(deletion.id);
        } else {
          await updateOutboxItemStatus(deletion.id, 'failed');
          pushSuccess = false;
        }
      }

      console.log('Fetching local data...');
      const [users, categories, inventory, sales, expenses, activities] = await Promise.all([
        getUsers(),
        getCategories(),
        getInventory(),
        getSales(),
        getExpenses(),
        getActivities(),
      ]);
      const outboxSnapshot = await getOutboxItems();

      const saleById = new Map(sales.map(sale => [sale.id, sale]));
      const expenseById = new Map(expenses.map(expense => [expense.id, expense]));
      const staleUpserts = outboxSnapshot.filter(item => {
        if (item.operation !== 'upsert') return false;
        if (item.entityType === 'sale') {
          const local = saleById.get(item.entityId);
          return !local || local.syncStatus !== 'pending';
        }
        if (item.entityType === 'expense') {
          const local = expenseById.get(item.entityId);
          return !local || local.syncStatus !== 'pending';
        }
        return false;
      });
      for (const item of staleUpserts) {
        await removeOutboxItem(item.id);
      }

      let pendingUsers = users.filter(u => u.syncStatus === 'pending');
      const pendingCategories = categories.filter(c => c.syncStatus === 'pending');
      const pendingInventory = inventory.filter(i => i.syncStatus === 'pending');
      const pendingSales = sales.filter(s => s.syncStatus === 'pending');
      const pendingExpenses = expenses.filter(e => e.syncStatus === 'pending');
      const pendingActivities = activities.filter(a => a.syncStatus === 'pending');

      console.log(
        `Pushing pending changes: ${pendingUsers.length} users, ${pendingCategories.length} categories, ${pendingInventory.length} inventory, ${pendingSales.length} sales, ${pendingExpenses.length} expenses, ${pendingActivities.length} activities`
      );

      if (pendingUsers.length > 0) {
        console.log('Resolving user PIN conflicts before push...');
        const usersToSkip = new Set<string>();

        for (const localUser of pendingUsers) {
          try {
            const serverUser = await findUserByPinInSupabase(localUser.pin);
            if (serverUser && serverUser.id !== localUser.id) {
              console.log(
                `PIN conflict detected: local ${localUser.id} vs server ${serverUser.id} for PIN ${localUser.pin}`
              );
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
        const saleUpserts = await getOutboxItems();
        const saleUpsertItems = saleUpserts.filter(
          (item): item is OutboxItem =>
            item.operation === 'upsert' &&
            item.entityType === 'sale' &&
            pendingSales.some(sale => sale.id === item.entityId)
        );
        for (const item of saleUpsertItems) {
          await updateOutboxItemStatus(item.id, 'in_progress');
        }
        const result = await syncSalesToSupabase(pendingSales);
        if (result) {
          for (const item of saleUpsertItems) {
            await removeOutboxItem(item.id);
          }
        } else {
          for (const item of saleUpsertItems) {
            await updateOutboxItemStatus(item.id, 'failed');
          }
          pushSuccess = false;
        }
      }

      if (pendingExpenses.length > 0) {
        console.log('Pushing expenses...');
        const expenseUpserts = await getOutboxItems();
        const expenseUpsertItems = expenseUpserts.filter(
          (item): item is OutboxItem =>
            item.operation === 'upsert' &&
            item.entityType === 'expense' &&
            pendingExpenses.some(expense => expense.id === item.entityId)
        );
        for (const item of expenseUpsertItems) {
          await updateOutboxItemStatus(item.id, 'in_progress');
        }
        const result = await syncExpensesToSupabase(pendingExpenses);
        if (result) {
          for (const item of expenseUpsertItems) {
            await removeOutboxItem(item.id);
          }
        } else {
          for (const item of expenseUpsertItems) {
            await updateOutboxItemStatus(item.id, 'failed');
          }
          pushSuccess = false;
        }
      }

      if (pendingActivities.length > 0) {
        console.log('Pushing activities...');
        const result = await syncActivitiesToSupabase(pendingActivities);
        if (!result) pushSuccess = false;
      }

      console.log(`Push completed: ${pushSuccess ? 'success' : 'some failures'}`);

      console.log('Pulling data from Supabase...');
      const [serverCategories, serverInventory, serverSales, serverExpenses, serverActivities] =
        await Promise.all([
          fetchCategoriesFromSupabase(),
          fetchInventoryFromSupabase(),
          fetchSalesFromSupabase(),
          fetchExpensesFromSupabase(),
          fetchActivitiesFromSupabase(),
        ]);

      console.log(
        `Pulled from server: ${serverUsers?.length || 0} users, ${serverCategories?.length || 0} categories, ${serverInventory?.length || 0} inventory, ${serverSales?.length || 0} sales, ${serverExpenses?.length || 0} expenses, ${serverActivities?.length || 0} activities`
      );

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
      setPendingCountStable(newPendingCount);
      const syncSucceeded = pushSuccess && newPendingCount === 0;

      if (syncSucceeded) {
        const completedAt = new Date();
        setLastSyncTime(completedAt);
        await AsyncStorage.setItem(LAST_SYNC_TIME_KEY, completedAt.toISOString());
      }

      if (newPendingCount === 0) {
        setSyncStatusStable('synced');
        console.log('Full sync completed successfully - all synced');
      } else {
        setSyncStatusStable('pending');
        console.log(`Full sync completed - ${newPendingCount} items still pending`);
      }

      return { ok: syncSucceeded };
    } catch (error) {
      console.log('Full sync error:', error);
      await checkPendingCountInternal(true);
      return { ok: false };
    } finally {
      isSyncingRef.current = false;
      setIsSyncingStable(false);
      setUiSyncActiveStable(false);
      if (needsResync.current) {
        needsResync.current = false;
        if (hasActiveSessionRef.current) {
          void triggerFullSync({ reason: 'auto' });
        }
      } else {
        void checkPendingCountInternal(isOnlineRef.current);
      }
    }
  }, [checkPendingCountInternal, setIsSyncingStable, setPendingCountStable, setSyncStatusStable, setUiSyncActiveStable, shouldUseUiSyncActive]);

  const checkPendingCount = useCallback(async () => {
    await checkPendingCountInternal(isOnline);
  }, [checkPendingCountInternal, isOnline]);

  useEffect(() => {
    let isMounted = true;

    const loadLastSyncTime = async () => {
      if (!supabaseConfigured) {
        return;
      }
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

    void loadLastSyncTime();

    return () => {
      isMounted = false;
    };
  }, [supabaseConfigured]);

  const syncNow = useCallback(async (options?: { reason?: SyncReason }): Promise<{ ok: boolean }> => {
    const result = await triggerFullSync({ reason: options?.reason || 'auto' });
    return result;
  }, [triggerFullSync]);

  const triggerSync = useCallback(async (): Promise<boolean> => {
    const result = await syncNow({ reason: 'manual' });
    return result.ok;
  }, [syncNow]);

  useEffect(() => {
    hasActiveSessionRef.current = Boolean(user);

    if (!user) {
      isSyncingRef.current = false;
      needsResync.current = false;
      setUiSyncActiveStable(false);
      setIsSyncingStable(false);
      setPendingCountStable(0);
      setSyncStatusStable(isOnlineRef.current ? 'synced' : 'offline');
      return;
    }

    void checkPendingCountInternal(isOnlineRef.current);
  }, [checkPendingCountInternal, setIsSyncingStable, setPendingCountStable, setSyncStatusStable, setUiSyncActiveStable, user]);

  useEffect(() => {
    void checkPendingCountInternal(true);

    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected ?? false;
      console.log('Network state changed:', online ? 'online' : 'offline');
      isOnlineRef.current = online;
      setIsOnline(prev => (prev === online ? prev : online));

      if (!online) {
        setSyncStatusStable('offline');
      } else if (!isSyncingRef.current && hasActiveSessionRef.current) {
        void triggerFullSync({ reason: 'auto' });
      }
    });

    return () => unsubscribe();
  }, [checkPendingCountInternal, setSyncStatusStable, triggerFullSync]);

  const queueDeletion = useCallback(async (
    entityType: DeletionTable,
    id: string,
    metadata?: { name?: string; amount?: number | null; date?: string | null }
  ) => {
    const mappedEntityType: OutboxEntityType = (() => {
      switch (entityType) {
        case 'sales':
          return 'sale';
        case 'expenses':
          return 'expense';
        case 'categories':
          return 'category';
        default:
          return entityType as OutboxEntityType;
      }
    })();
    await enqueueDeletion(mappedEntityType, id, metadata, { isSyncing: isSyncingRef.current });
    if (isSyncingRef.current) {
      needsResync.current = true;
    }
    await checkPendingCount();
  }, [checkPendingCount]);

  const syncBeforeLogout = useCallback(async (): Promise<boolean> => {
    const existingPending = await getPendingSyncCount();
    if (existingPending === 0) {
      return true;
    }
    if (!supabaseConfigured) {
      console.log('Supabase not configured, skipping logout sync.');
      return false;
    }
    console.log('Syncing before logout...');
    const result = await triggerFullSync({ reason: 'logout' });
    return result.ok;
  }, [supabaseConfigured, triggerFullSync]);

  const resetSyncState = useCallback(async () => {
    needsResync.current = false;
    isSyncingRef.current = false;
    setUiSyncActiveStable(false);
    setIsSyncingStable(false);
    setPendingCountStable(0);
    setSyncStatusStable(isOnlineRef.current ? 'synced' : 'offline');
  }, [setIsSyncingStable, setPendingCountStable, setSyncStatusStable, setUiSyncActiveStable]);

  const value = useMemo<SyncContextValue>(() => ({
    syncStatus,
    isSyncing,
    uiSyncActive,
    pendingCount,
    isOnline,
    lastSyncTime,
    syncNow,
    triggerSync,
    triggerFullSync,
    checkPendingCount,
    queueDeletion,
    syncBeforeLogout,
    resetSyncState,
  }), [
    syncStatus,
    isSyncing,
    uiSyncActive,
    pendingCount,
    isOnline,
    lastSyncTime,
    syncNow,
    triggerSync,
    triggerFullSync,
    checkPendingCount,
    queueDeletion,
    syncBeforeLogout,
    resetSyncState,
  ]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a <SyncProvider>');
  }
  return context;
}
