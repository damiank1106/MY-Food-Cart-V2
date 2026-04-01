import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Activity, ChatMessage, Expense, ExpenseItem, Sale, User, generateId } from '@/types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export interface SupabaseOperationResult {
  ok: boolean;
  code?: string;
  message?: string;
}

interface SupabaseAuthResult extends SupabaseOperationResult {
  authUserId?: string;
}

function normalizeExpenseItems(items: unknown): ExpenseItem[] {
  if (!Array.isArray(items)) return [];
  return items.reduce<ExpenseItem[]>((acc, item) => {
    if (typeof item === 'string') {
      const name = item.trim();
      if (name) acc.push({ id: generateId(), name });
      return acc;
    }
    if (item && typeof item === 'object') {
      const maybeItem = item as { id?: unknown; name?: unknown; price?: unknown };
      if (typeof maybeItem.name === 'string' && maybeItem.name.trim()) {
        const priceValue = typeof maybeItem.price === 'number' && !Number.isNaN(maybeItem.price)
          ? maybeItem.price
          : null;
        const idValue = typeof maybeItem.id === 'string' && maybeItem.id.trim()
          ? maybeItem.id
          : generateId();
        acc.push({ id: idValue, name: maybeItem.name.trim(), price: priceValue });
      }
    }
    return acc;
  }, []);
}

function isRemoteImageUrl(value?: string | null): boolean {
  return !!value && /^https?:\/\//i.test(value.trim());
}

export function toSyncableImageUrl(value?: string | null): string | null {
  return isRemoteImageUrl(value) ? value!.trim() : null;
}

export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY && supabase);
}

function buildSupabaseResult(
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string
): SupabaseOperationResult {
  if (error && typeof error === 'object') {
    const maybeError = error as { code?: unknown; message?: unknown };
    const code = typeof maybeError.code === 'string' ? maybeError.code : fallbackCode;
    const rawMessage = typeof maybeError.message === 'string' ? maybeError.message : fallbackMessage;

    if (code === 'anonymous_provider_disabled') {
      return {
        ok: false,
        code,
        message: 'Supabase Anonymous Sign-Ins are disabled. Enable them in Supabase Auth > Providers so chat can authenticate and pass RLS.',
      };
    }

    if (code === '42501') {
      return {
        ok: false,
        code,
        message: 'Supabase row-level security blocked the chat request. Confirm the chat SQL migration is installed and the app session is bound.',
      };
    }

    return {
      ok: false,
      code,
      message: rawMessage || fallbackMessage,
    };
  }

  return {
    ok: false,
    code: fallbackCode,
    message: fallbackMessage,
  };
}

export async function ensureSupabaseAuthSessionDetailed(): Promise<SupabaseAuthResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return {
      ok: false,
      code: 'supabase_not_configured',
      message: 'Supabase is not configured.',
    };
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.log('Error reading Supabase session:', sessionError);
    }
    if (sessionData.session?.user?.id) {
      return {
        ok: true,
        authUserId: sessionData.session.user.id,
      };
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.log('Error signing in anonymously to Supabase:', error);
      return buildSupabaseResult(
        error,
        'auth_session_unavailable',
        'Unable to sign in to Supabase for chat sync.'
      );
    }

    const authUserId = data.user?.id || data.session?.user?.id || null;
    if (!authUserId) {
      return {
        ok: false,
        code: 'auth_session_unavailable',
        message: 'Supabase did not return an authenticated user for chat sync.',
      };
    }

    return {
      ok: true,
      authUserId,
    };
  } catch (error) {
    console.log('Error ensuring Supabase auth session:', error);
    return buildSupabaseResult(
      error,
      'auth_session_unavailable',
      'Unable to establish a Supabase auth session for chat sync.'
    );
  }
}

export async function ensureSupabaseAuthSession(): Promise<string | null> {
  const result = await ensureSupabaseAuthSessionDetailed();
  return result.ok ? result.authUserId || null : null;
}

export async function ensureBoundChatSession(
  user: Pick<User, 'id' | 'role'>
): Promise<SupabaseAuthResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return {
      ok: false,
      code: 'supabase_not_configured',
      message: 'Supabase is not configured.',
    };
  }

  const authResult = await ensureSupabaseAuthSessionDetailed();
  if (!authResult.ok || !authResult.authUserId) {
    return authResult;
  }

  try {
    const { error } = await supabase.from('app_user_sessions').upsert(
      {
        auth_user_id: authResult.authUserId,
        app_user_id: user.id,
        app_user_role: user.role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'auth_user_id' }
    );

    if (error) {
      console.log('Error binding Supabase session to app user:', error);
      return buildSupabaseResult(
        error,
        'chat_session_binding_failed',
        'Unable to bind the Supabase auth session to the current app user.'
      );
    }

    return authResult;
  } catch (error) {
    console.log('Error binding Supabase session to app user:', error);
    return buildSupabaseResult(
      error,
      'chat_session_binding_failed',
      'Unable to bind the Supabase auth session to the current app user.'
    );
  }
}

export async function bindSupabaseSessionToAppUser(
  user: Pick<User, 'id' | 'role'>
): Promise<boolean> {
  const result = await ensureBoundChatSession(user);
  return result.ok;
}

export async function clearSupabaseSessionBinding(): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    const { data } = await supabase.auth.getSession();
    const authUserId = data.session?.user?.id;

    if (authUserId) {
      const { error } = await supabase
        .from('app_user_sessions')
        .delete()
        .eq('auth_user_id', authUserId);
      if (error) {
        console.log('Error clearing Supabase session binding:', error);
      }
    }

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.log('Error signing out from Supabase:', signOutError);
    }
  } catch (error) {
    console.log('Error clearing Supabase session binding:', error);
  }
}

export async function fetchUsersFromSupabase(): Promise<User[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  try {
    const { data, error } = await supabase.from('users').select('*');
    if (error) {
      console.log('Error fetching users from Supabase:', error);
      return null;
    }
    return data?.map(user => ({
      id: user.id,
      name: user.name,
      pin: user.pin,
      role: user.role,
      bio: user.bio ?? undefined,
      profilePicture: user.profile_picture_url ?? undefined,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      syncStatus: 'synced' as const,
    })) || [];
  } catch (error) {
    console.log('Error fetching users:', error);
    return null;
  }
}

export async function fetchSalesFromSupabase(): Promise<Sale[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  try {
    const { data, error } = await supabase.from('sales').select('*');
    if (error) {
      console.log('Error fetching sales from Supabase:', error);
      return null;
    }
    return data?.map(sale => ({
      id: sale.id,
      name: sale.name ?? '',
      items: Array.isArray(sale.items) ? sale.items : [],
      total: sale.total,
      date: sale.date,
      createdBy: sale.created_by,
      createdAt: sale.created_at,
      updatedAt: sale.updated_at,
      syncStatus: 'synced' as const,
    })) || [];
  } catch (error) {
    console.log('Error fetching sales:', error);
    return null;
  }
}

export async function fetchExpensesFromSupabase(): Promise<Expense[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  try {
    const { data, error } = await supabase.from('expenses').select('*');
    if (error) {
      console.log('Error fetching expenses from Supabase:', error);
      return null;
    }
    return data?.map(expense => ({
      id: expense.id,
      name: expense.name ?? '',
      items: normalizeExpenseItems(expense.items),
      total: expense.total,
      date: expense.date,
      createdBy: expense.created_by,
      createdAt: expense.created_at,
      updatedAt: expense.updated_at,
      syncStatus: 'synced' as const,
    })) || [];
  } catch (error) {
    console.log('Error fetching expenses:', error);
    return null;
  }
}

export async function fetchActivitiesFromSupabase(): Promise<Activity[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.log('Error fetching activities from Supabase:', error);
      return null;
    }
    return data?.map(activity => ({
      id: activity.id,
      type: activity.type,
      description: activity.description,
      userId: activity.user_id,
      createdAt: activity.created_at,
      syncStatus: 'synced' as const,
    })) || [];
  } catch (error) {
    console.log('Error fetching activities:', error);
    return null;
  }
}

export async function fetchChatMessagesFromSupabase(options?: {
  limit?: number;
  beforeCreatedAt?: string | null;
  user?: Pick<User, 'id' | 'role'>;
}): Promise<ChatMessage[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  try {
    if (options?.user) {
      const authResult = await ensureBoundChatSession(options.user);
      if (!authResult.ok) {
        console.log('Chat fetch skipped because chat auth session is unavailable:', authResult.message);
        return null;
      }
    }

    const limit = options?.limit ?? 100;
    let query = supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (options?.beforeCreatedAt) {
      query = query.lt('created_at', options.beforeCreatedAt);
    }

    const { data, error } = await query;
    if (error) {
      console.log('Error fetching chat messages from Supabase:', error);
      return null;
    }

    return data?.map(message => ({
      id: message.id,
      userId: message.user_id,
      userName: message.user_name,
      userAvatarUrl: message.user_avatar_url ?? null,
      localAvatarUri: null,
      messageText: message.message_text,
      createdAt: message.created_at,
      updatedAt: message.updated_at,
      syncStatus: 'synced' as const,
    })) || [];
  } catch (error) {
    console.log('Error fetching chat messages:', error);
    return null;
  }
}

export async function syncUsersToSupabase(users: User[]): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;

  try {
    const { error } = await supabase.from('users').upsert(
      users.map(user => ({
        id: user.id,
        name: user.name,
        pin: user.pin,
        role: user.role,
        bio: user.bio ?? null,
        profile_picture_url: toSyncableImageUrl(user.profilePicture),
        created_at: user.createdAt,
        updated_at: user.updatedAt,
      })),
      { onConflict: 'id' }
    );

    if (error) {
      console.log('Error syncing users:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.log('Error syncing users:', error);
    return false;
  }
}

export async function syncSalesToSupabase(sales: Sale[]): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;

  try {
    const { error } = await supabase.from('sales').upsert(
      sales.map(sale => ({
        id: sale.id,
        name: sale.name,
        items: sale.items ?? [],
        total: sale.total,
        date: sale.date,
        created_by: sale.createdBy,
        created_at: sale.createdAt,
        updated_at: sale.updatedAt,
      })),
      { onConflict: 'id' }
    );

    if (error) {
      console.log('Error syncing sales:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.log('Error syncing sales:', error);
    return false;
  }
}

export async function syncExpensesToSupabase(expenses: Expense[]): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;

  try {
    const { error } = await supabase.from('expenses').upsert(
      expenses.map(expense => ({
        id: expense.id,
        name: expense.name,
        items: normalizeExpenseItems(expense.items ?? []),
        total: expense.total,
        date: expense.date,
        created_by: expense.createdBy,
        created_at: expense.createdAt,
        updated_at: expense.updatedAt,
      })),
      { onConflict: 'id' }
    );

    if (error) {
      console.log('Error syncing expenses:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.log('Error syncing expenses:', error);
    return false;
  }
}

export async function syncActivitiesToSupabase(activities: Activity[]): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;

  try {
    const { error } = await supabase.from('activities').upsert(
      activities.map(activity => ({
        id: activity.id,
        type: activity.type,
        description: activity.description,
        user_id: activity.userId,
        created_at: activity.createdAt,
      })),
      { onConflict: 'id' }
    );

    if (error) {
      console.log('Error syncing activities:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.log('Error syncing activities:', error);
    return false;
  }
}

export async function syncChatMessagesToSupabase(
  messages: ChatMessage[],
  user: Pick<User, 'id' | 'role'>
): Promise<SupabaseOperationResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return {
      ok: false,
      code: 'supabase_not_configured',
      message: 'Supabase is not configured.',
    };
  }

  if (messages.length === 0) {
    return { ok: true };
  }

  try {
    const authResult = await ensureBoundChatSession(user);
    if (!authResult.ok) {
      return authResult;
    }

    const { error } = await supabase.from('chat_messages').upsert(
      messages.map(message => ({
        id: message.id,
        user_id: message.userId,
        user_name: message.userName,
        user_avatar_url: toSyncableImageUrl(message.userAvatarUrl ?? message.localAvatarUri ?? null),
        message_text: message.messageText,
        created_at: message.createdAt,
        updated_at: message.updatedAt,
      })),
      { onConflict: 'id' }
    );

    if (error) {
      console.log('Error syncing chat messages:', error);
      return buildSupabaseResult(
        error,
        'chat_insert_failed',
        'Unable to sync chat messages to Supabase.'
      );
    }
    return { ok: true };
  } catch (error) {
    console.log('Error syncing chat messages:', error);
    return buildSupabaseResult(
      error,
      'chat_insert_failed',
      'Unable to sync chat messages to Supabase.'
    );
  }
}

export async function deleteChatMessageFromSupabase(
  id: string,
  user: Pick<User, 'id' | 'role'>
): Promise<SupabaseOperationResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return {
      ok: false,
      code: 'supabase_not_configured',
      message: 'Supabase is not configured.',
    };
  }

  try {
    const authResult = await ensureBoundChatSession(user);
    if (!authResult.ok) {
      return authResult;
    }

    const { error } = await supabase.from('chat_messages').delete().eq('id', id);
    if (error) {
      console.log('Error deleting chat message from Supabase:', error);
      return buildSupabaseResult(
        error,
        'chat_delete_failed',
        'Unable to delete the chat message from Supabase.'
      );
    }

    return { ok: true };
  } catch (error) {
    console.log('Error deleting chat message from Supabase:', error);
    return buildSupabaseResult(
      error,
      'chat_delete_failed',
      'Unable to delete the chat message from Supabase.'
    );
  }
}

export async function findUserByPinInSupabase(pin: string): Promise<{ id: string; pin: string } | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, pin')
      .eq('pin', pin)
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.log('Error finding user by PIN:', error);
      return null;
    }
    return data ? { id: data.id, pin: data.pin } : null;
  } catch (error) {
    console.log('Error finding user by PIN:', error);
    return null;
  }
}

export async function deleteFromSupabase(table: string, id: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;

  try {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      console.log(`Error deleting from ${table}:`, error);
      return false;
    }
    return true;
  } catch (error) {
    console.log(`Error deleting from ${table}:`, error);
    return false;
  }
}
