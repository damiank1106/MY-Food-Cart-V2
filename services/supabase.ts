import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Category, InventoryItem, Sale, Expense, Activity } from '@/types';

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

export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY && supabase);
}

export async function fetchUsersFromSupabase(): Promise<User[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  
  try {
    const { data, error } = await supabase.from('users').select('*');
    if (error) {
      console.log('Error fetching users from Supabase:', error);
      return null;
    }
    return data?.map(u => ({
      id: u.id,
      name: u.name,
      pin: u.pin,
      role: u.role,
      bio: u.bio,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
      syncStatus: 'synced' as const,
    })) || [];
  } catch (error) {
    console.log('Error fetching users:', error);
    return null;
  }
}

export async function fetchCategoriesFromSupabase(): Promise<Category[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  
  try {
    const { data, error } = await supabase.from('categories').select('*');
    if (error) {
      console.log('Error fetching categories from Supabase:', error);
      return null;
    }
    return data?.map(c => ({
      id: c.id,
      name: c.name,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      syncStatus: 'synced' as const,
    })) || [];
  } catch (error) {
    console.log('Error fetching categories:', error);
    return null;
  }
}

export async function fetchInventoryFromSupabase(): Promise<InventoryItem[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  
  try {
    const { data, error } = await supabase.from('inventory').select('*');
    if (error) {
      console.log('Error fetching inventory from Supabase:', error);
      return null;
    }
    return data?.map(i => ({
      id: i.id,
      name: i.name,
      categoryId: i.category_id,
      unit: i.unit,
      price: i.price,
      quantity: i.quantity,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      createdBy: i.created_by,
      syncStatus: 'synced' as const,
    })) || [];
  } catch (error) {
    console.log('Error fetching inventory:', error);
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
    return data?.map(s => ({
      id: s.id,
      name: s.name,
      total: s.total,
      date: s.date,
      createdBy: s.created_by,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
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
    return data?.map(e => ({
      id: e.id,
      name: e.name,
      total: e.total,
      date: e.date,
      createdBy: e.created_by,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
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
    const { data, error } = await supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) {
      console.log('Error fetching activities from Supabase:', error);
      return null;
    }
    return data?.map(a => ({
      id: a.id,
      type: a.type,
      description: a.description,
      userId: a.user_id,
      createdAt: a.created_at,
      syncStatus: 'synced' as const,
    })) || [];
  } catch (error) {
    console.log('Error fetching activities:', error);
    return null;
  }
}

export async function syncUsersToSupabase(users: User[]): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  
  try {
    const { error } = await supabase.from('users').upsert(
      users.map(u => ({
        id: u.id,
        name: u.name,
        pin: u.pin,
        role: u.role,
        created_at: u.createdAt,
        updated_at: u.updatedAt,
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

export async function syncCategoriesToSupabase(categories: Category[]): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  
  try {
    const { error } = await supabase.from('categories').upsert(
      categories.map(c => ({
        id: c.id,
        name: c.name,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
      })),
      { onConflict: 'id' }
    );
    
    if (error) {
      console.log('Error syncing categories:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.log('Error syncing categories:', error);
    return false;
  }
}

export async function syncInventoryToSupabase(items: InventoryItem[]): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  
  try {
    const { error } = await supabase.from('inventory').upsert(
      items.map(i => ({
        id: i.id,
        name: i.name,
        category_id: i.categoryId,
        unit: i.unit,
        price: i.price,
        quantity: i.quantity,
        created_at: i.createdAt,
        updated_at: i.updatedAt,
        created_by: i.createdBy,
      })),
      { onConflict: 'id' }
    );
    
    if (error) {
      console.log('Error syncing inventory:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.log('Error syncing inventory:', error);
    return false;
  }
}

export async function syncSalesToSupabase(sales: Sale[]): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  
  try {
    const { error } = await supabase.from('sales').upsert(
      sales.map(s => ({
        id: s.id,
        name: s.name,
        total: s.total,
        date: s.date,
        created_by: s.createdBy,
        created_at: s.createdAt,
        updated_at: s.updatedAt,
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
      expenses.map(e => ({
        id: e.id,
        name: e.name,
        total: e.total,
        date: e.date,
        created_by: e.createdBy,
        created_at: e.createdAt,
        updated_at: e.updatedAt,
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
      activities.map(a => ({
        id: a.id,
        type: a.type,
        description: a.description,
        user_id: a.userId,
        created_at: a.createdAt,
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
