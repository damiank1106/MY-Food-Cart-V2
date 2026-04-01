import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { ChatMessage, OutboxEntityType, OutboxItem } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  getUsers,
  getSales,
  getExpenses,
  getActivities,
  getChatMessages,
  getPendingSyncCount,
  getOutboxItems,
  enqueueDeletion,
  removeOutboxItem,
  updateOutboxItemStatus,
  upsertUsersFromServer,
  upsertSalesFromServer,
  upsertExpensesFromServer,
  upsertActivitiesFromServer,
  upsertChatMessagesFromServer,
  migrateLocalUserIdsToServerIds,
  resolveUserPinConflict,
  markUsersSynced,
  markSalesSynced,
  markExpensesSynced,
  markActivitiesSynced,
  markChatMessagesSynced,
} from '@/services/database';
import {
  isSupabaseConfigured,
  SupabaseOperationResult,
  syncUsersToSupabase,
  syncSalesToSupabase,
  syncExpensesToSupabase,
  syncActivitiesToSupabase,
  syncChatMessagesToSupabase,
  deleteChatMessageFromSupabase,
  deleteFromSupabase,
  fetchUsersFromSupabase,
  fetchSalesFromSupabase,
  fetchExpensesFromSupabase,
  fetchActivitiesFromSupabase,
  fetchChatMessagesFromSupabase,
  findUserByPinInSupabase,
} from '@/services/supabase';

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'offline';

export type SyncReason = 'login' | 'logout' | 'manual' | 'auto';

const DEVELOPER_PIN = '2345';
const LAST_SYNC_TIME_KEY = '@myfoodcart_last_sync_time';
const CHAT_SYNC_FETCH_LIMIT = 200;

type DeletionTable = 'users' | 'sales' | 'expenses' | 'activities' | 'chat_messages';

function getDeletionTableName(entityType: OutboxEntityType): string | null {
  switch (entityType) {
    case 'sale':
      return 'sales';
    case 'expense':
      return 'expenses';
    case 'user':
      return 'users';
    case 'activity':
      return 'activities';
    case 'chat_message':
      return 'chat_messages';
    default:
      return null;
  }
}

export const [SyncProvider, useSync] = createContextHook(() => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const supabaseConfigured = isSupabaseConfigured();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const isSyncing = useRef(false);
  const needsResync = useRef(false);

  const invalidateLocalQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['sales'] });
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['activities'] });
    queryClient.invalidateQueries({ queryKey: ['weeklySalesTotals'] });
    queryClient.invalidateQueries({ queryKey: ['weeklyExpenseTotals'] });
    queryClient.invalidateQueries({ queryKey: ['monthlyTotals'] });
    queryClient.invalidateQueries({ queryKey: ['chatMessages'] });
    queryClient.invalidateQueries({ queryKey: ['chatMessageCount'] });
  }, [queryClient]);

  const checkPendingCountInternal = useCallback(async (online: boolean) => {
    const count = await getPendingSyncCount();
    setPendingCount(count);

    if (count > 0) {
      setSyncStatus('pending');
    } else if (online) {
      setSyncStatus('synced');
    }
  }, []);

  const recordSuccessfulSync = useCallback(async () => {
    const completedAt = new Date();
    setLastSyncTime(completedAt);
    await AsyncStorage.setItem(LAST_SYNC_TIME_KEY, completedAt.toISOString());
  }, []);

  const removeOutboxItemsForEntity = useCallback(async (
    entityType: OutboxEntityType,
    entityId: string,
    operation?: 'upsert' | 'delete'
  ) => {
    const items = await getOutboxItems();
    const matchingItems = items.filter(item =>
      item.entityType === entityType &&
      item.entityId === entityId &&
      (!operation || item.operation === operation)
    );

    for (const item of matchingItems) {
      await removeOutboxItem(item.id);
    }
  }, []);

  const syncChatMessageNow = useCallback(async (message: ChatMessage): Promise<SupabaseOperationResult> => {
    if (!user) {
      return {
        ok: false,
        code: 'user_unavailable',
        message: 'No current user is available for chat sync.',
      };
    }

    if (!supabaseConfigured) {
      await checkPendingCountInternal(isOnline);
      return {
        ok: false,
        code: 'supabase_not_configured',
        message: 'Supabase is not configured.',
      };
    }

    const netState = await NetInfo.fetch();
    const online = netState.isConnected ?? false;
    setIsOnline(online);

    if (!online) {
      setSyncStatus('offline');
      await checkPendingCountInternal(false);
      return {
        ok: false,
        code: 'offline',
        message: 'Offline. Message saved locally and will sync automatically when the network returns.',
      };
    }

    const outboxItems = (await getOutboxItems()).filter(
      item => item.entityType === 'chat_message' && item.entityId === message.id && item.operation === 'upsert'
    );

    for (const item of outboxItems) {
      await updateOutboxItemStatus(item.id, 'in_progress');
    }

    const result = await syncChatMessagesToSupabase([message], user);
    if (result.ok) {
      await markChatMessagesSynced([message.id]);
      await removeOutboxItemsForEntity('chat_message', message.id, 'upsert');
      invalidateLocalQueries();
      await recordSuccessfulSync();
      await checkPendingCountInternal(true);
      return result;
    }

    for (const item of outboxItems) {
      await updateOutboxItemStatus(item.id, 'failed');
    }
    invalidateLocalQueries();
    await checkPendingCountInternal(true);
    return result;
  }, [
    checkPendingCountInternal,
    invalidateLocalQueries,
    isOnline,
    recordSuccessfulSync,
    removeOutboxItemsForEntity,
    supabaseConfigured,
    user,
  ]);

  const syncChatDeletionNow = useCallback(async (messageId: string): Promise<SupabaseOperationResult> => {
    if (!user) {
      return {
        ok: false,
        code: 'user_unavailable',
        message: 'No current user is available for chat delete sync.',
      };
    }

    if (!supabaseConfigured) {
      await checkPendingCountInternal(isOnline);
      return {
        ok: false,
        code: 'supabase_not_configured',
        message: 'Supabase is not configured.',
      };
    }

    const netState = await NetInfo.fetch();
    const online = netState.isConnected ?? false;
    setIsOnline(online);

    if (!online) {
      setSyncStatus('offline');
      await checkPendingCountInternal(false);
      return {
        ok: false,
        code: 'offline',
        message: 'Offline. Delete saved locally and will sync automatically when the network returns.',
      };
    }

    const outboxItems = (await getOutboxItems()).filter(
      item => item.entityType === 'chat_message' && item.entityId === messageId && item.operation === 'delete'
    );

    if (outboxItems.length === 0) {
      await checkPendingCountInternal(true);
      return { ok: true };
    }

    for (const item of outboxItems) {
      await updateOutboxItemStatus(item.id, 'in_progress');
    }

    const result = await deleteChatMessageFromSupabase(messageId, user);
    if (result.ok) {
      await removeOutboxItemsForEntity('chat_message', messageId, 'delete');
      invalidateLocalQueries();
      await recordSuccessfulSync();
      await checkPendingCountInternal(true);
      return result;
    }

    for (const item of outboxItems) {
      await updateOutboxItemStatus(item.id, 'failed');
    }
    invalidateLocalQueries();
    await checkPendingCountInternal(true);
    return result;
  }, [
    checkPendingCountInternal,
    invalidateLocalQueries,
    isOnline,
    recordSuccessfulSync,
    removeOutboxItemsForEntity,
    supabaseConfigured,
    user,
  ]);

  const triggerFullSync = useCallback(async (options?: { reason: SyncReason }): Promise<{ ok: boolean }> => {
    const reason = options?.reason || 'auto';
    console.log(`Starting full bi-directional sync (reason: ${reason})...`);

    if (isSyncing.current) {
      console.log('Sync already in progress, skipping...');
      return { ok: false };
    }

    if (!supabaseConfigured) {
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
          serverUsers: serverUsers.map(serverUser => ({
            id: serverUser.id,
            pin: serverUser.pin,
            role: serverUser.role,
            name: serverUser.name,
          })),
          fallbackPin: DEVELOPER_PIN,
        });
      } else {
        console.log('No server users found, skipping migration');
      }

      let pushSuccess = true;

      console.log('Processing pending deletions...');
      const pendingDeletions = (await getOutboxItems())
        .filter(item => item.operation === 'delete')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      for (const deletion of pendingDeletions) {
        const table = getDeletionTableName(deletion.entityType);
        if (!table) {
          await updateOutboxItemStatus(deletion.id, 'failed');
          pushSuccess = false;
          continue;
        }

        await updateOutboxItemStatus(deletion.id, 'in_progress');
        const deletionResult = table === 'chat_messages'
          ? (user ? await deleteChatMessageFromSupabase(deletion.entityId, user) : {
              ok: false,
              code: 'user_unavailable',
              message: 'No current user is available for chat delete sync.',
            })
          : {
              ok: await deleteFromSupabase(table, deletion.entityId),
            };

        if (deletionResult.ok) {
          await removeOutboxItem(deletion.id);
        } else {
          console.log(`Deletion sync failed for ${table}:${deletion.entityId}`, deletionResult.message ?? 'Unknown error');
          await updateOutboxItemStatus(deletion.id, 'failed');
          pushSuccess = false;
        }
      }

      console.log('Fetching local data...');
      let [users, sales, expenses, activities, chatMessages] = await Promise.all([
        getUsers(),
        getSales(),
        getExpenses(),
        getActivities(),
        getChatMessages({ limit: CHAT_SYNC_FETCH_LIMIT }),
      ]);
      const outboxSnapshot = await getOutboxItems();

      const saleById = new Map(sales.map(sale => [sale.id, sale]));
      const expenseById = new Map(expenses.map(expense => [expense.id, expense]));
      const chatMessageById = new Map(chatMessages.map(message => [message.id, message]));
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
        if (item.entityType === 'chat_message') {
          const local = chatMessageById.get(item.entityId);
          return !local || local.syncStatus !== 'pending';
        }
        return false;
      });
      for (const item of staleUpserts) {
        await removeOutboxItem(item.id);
      }

      let pendingUsers = users.filter(localUser => localUser.syncStatus === 'pending');
      const pendingSales = sales.filter(sale => sale.syncStatus === 'pending');
      const pendingExpenses = expenses.filter(expense => expense.syncStatus === 'pending');
      const pendingActivities = activities.filter(activity => activity.syncStatus === 'pending');
      const pendingChatMessages = chatMessages.filter(message => message.syncStatus === 'pending');

      console.log(
        `Pushing pending changes: ${pendingUsers.length} users, ${pendingSales.length} sales, ${pendingExpenses.length} expenses, ${pendingActivities.length} activities, ${pendingChatMessages.length} chat messages`
      );

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

        users = await getUsers();
        pendingUsers = users.filter(localUser => localUser.syncStatus === 'pending' && !usersToSkip.has(localUser.id));

        if (pendingUsers.length > 0) {
          console.log(`Pushing ${pendingUsers.length} users (${usersToSkip.size} resolved via PIN conflict)...`);
          const result = await syncUsersToSupabase(pendingUsers);
          if (result) {
            await markUsersSynced(pendingUsers.map(localUser => localUser.id));
          } else {
            pushSuccess = false;
          }
        } else {
          console.log(`All ${usersToSkip.size} pending users resolved via PIN conflict, none to push`);
        }
      }

      if (pendingSales.length > 0) {
        console.log('Pushing sales...');
        const saleUpsertItems = (await getOutboxItems()).filter(
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
          await markSalesSynced(pendingSales.map(sale => sale.id));
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
        const expenseUpsertItems = (await getOutboxItems()).filter(
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
          await markExpensesSynced(pendingExpenses.map(expense => expense.id));
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
        if (result) {
          await markActivitiesSynced(pendingActivities.map(activity => activity.id));
        } else {
          pushSuccess = false;
        }
      }

      if (user && pendingChatMessages.length > 0) {
        console.log('Pushing chat messages...');
        const chatUpsertItems = (await getOutboxItems()).filter(
          (item): item is OutboxItem =>
            item.operation === 'upsert' &&
            item.entityType === 'chat_message' &&
            pendingChatMessages.some(message => message.id === item.entityId)
        );
        for (const item of chatUpsertItems) {
          await updateOutboxItemStatus(item.id, 'in_progress');
        }
        const result = await syncChatMessagesToSupabase(pendingChatMessages, user);
        if (result.ok) {
          await markChatMessagesSynced(pendingChatMessages.map(message => message.id));
          for (const item of chatUpsertItems) {
            await removeOutboxItem(item.id);
          }
        } else {
          console.log('Error pushing chat messages:', result.message ?? 'Unknown error');
          for (const item of chatUpsertItems) {
            await updateOutboxItemStatus(item.id, 'failed');
          }
          pushSuccess = false;
        }
      }

      console.log(`Push completed: ${pushSuccess ? 'success' : 'some failures'}`);

      console.log('Pulling data from Supabase...');
      const [serverSales, serverExpenses, serverActivities, serverChatMessages] = await Promise.all([
        fetchSalesFromSupabase(),
        fetchExpensesFromSupabase(),
        fetchActivitiesFromSupabase(),
        user ? fetchChatMessagesFromSupabase({ limit: CHAT_SYNC_FETCH_LIMIT, user }) : Promise.resolve(null),
      ]);

      console.log(
        `Pulled from server: ${serverUsers?.length || 0} users, ${serverSales?.length || 0} sales, ${serverExpenses?.length || 0} expenses, ${serverActivities?.length || 0} activities, ${serverChatMessages?.length || 0} chat messages`
      );

      if (serverUsers) await upsertUsersFromServer(serverUsers);
      if (serverSales) await upsertSalesFromServer(serverSales);
      if (serverExpenses) await upsertExpensesFromServer(serverExpenses);
      if (serverActivities) await upsertActivitiesFromServer(serverActivities);
      if (serverChatMessages) await upsertChatMessagesFromServer(serverChatMessages);

      invalidateLocalQueries();

      const newPendingCount = await getPendingSyncCount();
      setPendingCount(newPendingCount);
      const syncSucceeded = pushSuccess && newPendingCount === 0;

      if (syncSucceeded) {
        await recordSuccessfulSync();
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
      if (needsResync.current) {
        needsResync.current = false;
        triggerFullSync({ reason: 'auto' });
      }
    }
  }, [checkPendingCountInternal, deleteChatMessageFromSupabase, invalidateLocalQueries, recordSuccessfulSync, supabaseConfigured, user]);

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

    loadLastSyncTime();

    return () => {
      isMounted = false;
    };
  }, [supabaseConfigured]);

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
        case 'chat_messages':
          return 'chat_message';
        default:
          return entityType as OutboxEntityType;
      }
    })();

    await enqueueDeletion(mappedEntityType, id, metadata, { isSyncing: isSyncing.current });
    if (isSyncing.current) {
      needsResync.current = true;
    }
    await checkPendingCount();
  }, [checkPendingCount]);

  const syncBeforeLogout = useCallback(async (): Promise<boolean> => {
    if (!supabaseConfigured) {
      console.log('Supabase not configured, skipping logout sync.');
      return false;
    }
    console.log('Syncing before logout...');
    const result = await triggerFullSync({ reason: 'logout' });
    return result.ok;
  }, [supabaseConfigured, triggerFullSync]);

  return {
    syncStatus,
    pendingCount,
    isOnline,
    lastSyncTime,
    triggerSync,
    triggerFullSync,
    checkPendingCount,
    queueDeletion,
    syncChatMessageNow,
    syncChatDeletionNow,
    syncBeforeLogout,
  };
});
