import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  User, Category, InventoryItem, Sale, Expense, Activity,
  DEFAULT_USERS, DEFAULT_CATEGORIES, generateId 
} from '@/types';

let db: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<void> | null = null;
let dbInitialized = false;

const STORAGE_KEYS = {
  users: '@myfoodcart_users',
  categories: '@myfoodcart_categories',
  inventory: '@myfoodcart_inventory',
  sales: '@myfoodcart_sales',
  expenses: '@myfoodcart_expenses',
  activities: '@myfoodcart_activities',
  settings: '@myfoodcart_settings',
};

async function getFromStorage<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : defaultValue;
  } catch (error) {
    console.log('Error reading from storage:', error);
    return defaultValue;
  }
}

async function setToStorage<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.log('Error writing to storage:', error);
  }
}

async function ensureDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (Platform.OS === 'web') return null;
  if (db && dbInitialized) return db;
  if (dbInitPromise) {
    await dbInitPromise;
    return db;
  }
  return null;
}

export async function initDatabase(): Promise<void> {
  console.log('Initializing database...');
  
  if (Platform.OS === 'web') {
    console.log('Using AsyncStorage for web platform');
    await initWebDatabase();
    dbInitialized = true;
    return;
  }

  if (dbInitialized && db) {
    console.log('Database already initialized');
    return;
  }

  if (dbInitPromise) {
    console.log('Database initialization in progress, waiting...');
    await dbInitPromise;
    return;
  }

  dbInitPromise = (async () => {
    try {
      console.log('Opening SQLite database...');
      db = await SQLite.openDatabaseAsync('myfoodcart.db');
      console.log('SQLite database opened');

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pin TEXT NOT NULL,
        role TEXT NOT NULL,
        bio TEXT,
        profilePicture TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncStatus TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncStatus TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        categoryId TEXT,
        unit TEXT NOT NULL,
        price REAL NOT NULL,
        quantity REAL NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        createdBy TEXT NOT NULL,
        syncStatus TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        total REAL NOT NULL,
        date TEXT NOT NULL,
        createdBy TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncStatus TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        total REAL NOT NULL,
        date TEXT NOT NULL,
        createdBy TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncStatus TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        userId TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        syncStatus TEXT DEFAULT 'pending'
      );
    `);

      console.log('Database tables created');
      await seedDefaultData();
      dbInitialized = true;
      console.log('Database initialization complete');
    } catch (error) {
      console.log('Error initializing SQLite database:', error);
      db = null;
      dbInitPromise = null;
      throw error;
    }
  })();

  await dbInitPromise;
}

async function initWebDatabase(): Promise<void> {
  const users = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
  if (users.length === 0) {
    await seedDefaultDataWeb();
  }
}

async function seedDefaultData(): Promise<void> {
  if (!db) return;

  const existingUsers = await db.getAllAsync<User>('SELECT * FROM users');
  if (existingUsers.length === 0) {
    console.log('Seeding default users...');
    const now = new Date().toISOString();
    
    for (const user of DEFAULT_USERS) {
      await db.runAsync(
        'INSERT INTO users (id, name, pin, role, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [generateId(), user.name, user.pin, user.role, now, now, 'pending']
      );
    }
  }

  const existingCategories = await db.getAllAsync<Category>('SELECT * FROM categories');
  if (existingCategories.length === 0) {
    console.log('Seeding default categories...');
    const now = new Date().toISOString();
    
    for (const name of DEFAULT_CATEGORIES) {
      await db.runAsync(
        'INSERT INTO categories (id, name, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?)',
        [generateId(), name, now, now, 'pending']
      );
    }
  }
}

async function seedDefaultDataWeb(): Promise<void> {
  console.log('Seeding default data for web...');
  const now = new Date().toISOString();

  const users: User[] = DEFAULT_USERS.map(user => ({
    ...user,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending' as const,
  }));
  await setToStorage(STORAGE_KEYS.users, users);

  const categories: Category[] = DEFAULT_CATEGORIES.map(name => ({
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending' as const,
  }));
  await setToStorage(STORAGE_KEYS.categories, categories);
  await setToStorage(STORAGE_KEYS.inventory, []);
  await setToStorage(STORAGE_KEYS.sales, []);
  await setToStorage(STORAGE_KEYS.expenses, []);
  await setToStorage(STORAGE_KEYS.activities, []);
}

export async function getUsers(): Promise<User[]> {
  if (Platform.OS === 'web') {
    return getFromStorage<User[]>(STORAGE_KEYS.users, []);
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    return await database.getAllAsync<User>('SELECT * FROM users ORDER BY name');
  } catch (error) {
    console.log('Error getting users:', error);
    return [];
  }
}

export async function getUserByPin(pin: string): Promise<User | null> {
  if (Platform.OS === 'web') {
    const users = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
    return users.find(u => u.pin === pin) || null;
  }
  const database = await ensureDb();
  if (!database) return null;
  try {
    const users = await database.getAllAsync<User>('SELECT * FROM users WHERE pin = ?', [pin]);
    return users[0] || null;
  } catch (error) {
    console.log('Error getting user by PIN:', error);
    return null;
  }
}

export async function updateUser(user: User): Promise<void> {
  const now = new Date().toISOString();
  if (Platform.OS === 'web') {
    const users = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
    const index = users.findIndex(u => u.id === user.id);
    if (index !== -1) {
      users[index] = { ...user, updatedAt: now, syncStatus: 'pending' };
      await setToStorage(STORAGE_KEYS.users, users);
    }
    return;
  }
  const database = await ensureDb();
  if (!database) return;
  try {
    await database.runAsync(
      'UPDATE users SET name = ?, pin = ?, bio = ?, profilePicture = ?, updatedAt = ?, syncStatus = ? WHERE id = ?',
      [user.name, user.pin, user.bio || null, user.profilePicture || null, now, 'pending', user.id]
    );
  } catch (error) {
    console.log('Error updating user:', error);
  }
}

export async function createUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>): Promise<User> {
  const now = new Date().toISOString();
  const newUser: User = {
    ...user,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };

  if (Platform.OS === 'web') {
    const users = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
    users.push(newUser);
    await setToStorage(STORAGE_KEYS.users, users);
    return newUser;
  }

  const database = await ensureDb();
  if (!database) throw new Error('Database not initialized');
  await database.runAsync(
    'INSERT INTO users (id, name, pin, role, bio, profilePicture, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [newUser.id, newUser.name, newUser.pin, newUser.role, newUser.bio || null, newUser.profilePicture || null, now, now, 'pending']
  );
  return newUser;
}

export async function deleteUser(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    const users = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
    await setToStorage(STORAGE_KEYS.users, users.filter(u => u.id !== id));
    return;
  }
  const database = await ensureDb();
  if (!database) return;
  await database.runAsync('DELETE FROM users WHERE id = ?', [id]);
}

export async function isPinTaken(pin: string, excludeUserId?: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const users = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
    return users.some(u => u.pin === pin && u.id !== excludeUserId);
  }
  const database = await ensureDb();
  if (!database) return false;
  try {
    const query = excludeUserId 
      ? 'SELECT COUNT(*) as count FROM users WHERE pin = ? AND id != ?'
      : 'SELECT COUNT(*) as count FROM users WHERE pin = ?';
    const params = excludeUserId ? [pin, excludeUserId] : [pin];
    const result = await database.getFirstAsync<{ count: number }>(query, params);
    return (result?.count || 0) > 0;
  } catch (error) {
    console.log('Error checking PIN:', error);
    return false;
  }
}

export async function getCategories(): Promise<Category[]> {
  if (Platform.OS === 'web') {
    return getFromStorage<Category[]>(STORAGE_KEYS.categories, []);
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    return await database.getAllAsync<Category>('SELECT * FROM categories ORDER BY name');
  } catch (error) {
    console.log('Error getting categories:', error);
    return [];
  }
}

export async function createCategory(name: string): Promise<Category> {
  const now = new Date().toISOString();
  const newCategory: Category = {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };

  if (Platform.OS === 'web') {
    const categories = await getFromStorage<Category[]>(STORAGE_KEYS.categories, []);
    categories.push(newCategory);
    await setToStorage(STORAGE_KEYS.categories, categories);
    return newCategory;
  }

  const database = await ensureDb();
  if (!database) throw new Error('Database not initialized');
  await database.runAsync(
    'INSERT INTO categories (id, name, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?)',
    [newCategory.id, newCategory.name, now, now, 'pending']
  );
  return newCategory;
}

export async function updateCategory(id: string, name: string): Promise<void> {
  const now = new Date().toISOString();
  if (Platform.OS === 'web') {
    const categories = await getFromStorage<Category[]>(STORAGE_KEYS.categories, []);
    const index = categories.findIndex(c => c.id === id);
    if (index !== -1) {
      categories[index] = { ...categories[index], name, updatedAt: now, syncStatus: 'pending' };
      await setToStorage(STORAGE_KEYS.categories, categories);
    }
    return;
  }
  const database = await ensureDb();
  if (!database) return;
  await database.runAsync('UPDATE categories SET name = ?, updatedAt = ?, syncStatus = ? WHERE id = ?', [name, now, 'pending', id]);
}

export async function deleteCategory(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    const categories = await getFromStorage<Category[]>(STORAGE_KEYS.categories, []);
    await setToStorage(STORAGE_KEYS.categories, categories.filter(c => c.id !== id));
    return;
  }
  const database = await ensureDb();
  if (!database) return;
  await database.runAsync('DELETE FROM categories WHERE id = ?', [id]);
}

export async function getCategoryItemCount(categoryId: string): Promise<number> {
  if (Platform.OS === 'web') {
    const inventory = await getFromStorage<InventoryItem[]>(STORAGE_KEYS.inventory, []);
    return inventory.filter(i => i.categoryId === categoryId).length;
  }
  const database = await ensureDb();
  if (!database) return 0;
  try {
    const result = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM inventory WHERE categoryId = ?', [categoryId]);
    return result?.count || 0;
  } catch (error) {
    console.log('Error getting category item count:', error);
    return 0;
  }
}

export async function getInventory(): Promise<InventoryItem[]> {
  if (Platform.OS === 'web') {
    return getFromStorage<InventoryItem[]>(STORAGE_KEYS.inventory, []);
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    return await database.getAllAsync<InventoryItem>('SELECT * FROM inventory ORDER BY name');
  } catch (error) {
    console.log('Error getting inventory:', error);
    return [];
  }
}

export async function getInventoryByCategory(categoryId: string | null): Promise<InventoryItem[]> {
  if (Platform.OS === 'web') {
    const inventory = await getFromStorage<InventoryItem[]>(STORAGE_KEYS.inventory, []);
    return categoryId ? inventory.filter(i => i.categoryId === categoryId) : inventory;
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    if (categoryId) {
      return await database.getAllAsync<InventoryItem>('SELECT * FROM inventory WHERE categoryId = ? ORDER BY name', [categoryId]);
    }
    return await database.getAllAsync<InventoryItem>('SELECT * FROM inventory ORDER BY name');
  } catch (error) {
    console.log('Error getting inventory by category:', error);
    return [];
  }
}

export async function createInventoryItem(item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>): Promise<InventoryItem> {
  const now = new Date().toISOString();
  const newItem: InventoryItem = {
    ...item,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };

  if (Platform.OS === 'web') {
    const inventory = await getFromStorage<InventoryItem[]>(STORAGE_KEYS.inventory, []);
    inventory.push(newItem);
    await setToStorage(STORAGE_KEYS.inventory, inventory);
    return newItem;
  }

  const database = await ensureDb();
  if (!database) throw new Error('Database not initialized');
  await database.runAsync(
    'INSERT INTO inventory (id, name, categoryId, unit, price, quantity, createdAt, updatedAt, createdBy, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [newItem.id, newItem.name, newItem.categoryId, newItem.unit, newItem.price, newItem.quantity, now, now, newItem.createdBy, 'pending']
  );
  return newItem;
}

export async function updateInventoryItem(item: InventoryItem): Promise<void> {
  const now = new Date().toISOString();
  if (Platform.OS === 'web') {
    const inventory = await getFromStorage<InventoryItem[]>(STORAGE_KEYS.inventory, []);
    const index = inventory.findIndex(i => i.id === item.id);
    if (index !== -1) {
      inventory[index] = { ...item, updatedAt: now, syncStatus: 'pending' };
      await setToStorage(STORAGE_KEYS.inventory, inventory);
    }
    return;
  }
  const database = await ensureDb();
  if (!database) return;
  await database.runAsync(
    'UPDATE inventory SET name = ?, categoryId = ?, unit = ?, price = ?, quantity = ?, updatedAt = ?, syncStatus = ? WHERE id = ?',
    [item.name, item.categoryId, item.unit, item.price, item.quantity, now, 'pending', item.id]
  );
}

export async function deleteInventoryItem(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    const inventory = await getFromStorage<InventoryItem[]>(STORAGE_KEYS.inventory, []);
    await setToStorage(STORAGE_KEYS.inventory, inventory.filter(i => i.id !== id));
    return;
  }
  const database = await ensureDb();
  if (!database) return;
  await database.runAsync('DELETE FROM inventory WHERE id = ?', [id]);
}

export async function getSales(): Promise<Sale[]> {
  if (Platform.OS === 'web') {
    return getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    return await database.getAllAsync<Sale>('SELECT * FROM sales ORDER BY date DESC, createdAt DESC');
  } catch (error) {
    console.log('Error getting sales:', error);
    return [];
  }
}

export async function getSalesByDate(date: string): Promise<Sale[]> {
  if (Platform.OS === 'web') {
    const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    return sales.filter(s => {
      const normalizedDate = s.date ? s.date.substring(0, 10) : '';
      return normalizedDate === date;
    });
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    return await database.getAllAsync<Sale>('SELECT * FROM sales WHERE substr(date, 1, 10) = ? ORDER BY createdAt DESC', [date]);
  } catch (error) {
    console.log('Error getting sales by date:', error);
    return [];
  }
}

export async function getSalesByDateRange(startDate: string, endDate: string): Promise<Sale[]> {
  if (Platform.OS === 'web') {
    const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    return sales.filter(s => s.date >= startDate && s.date <= endDate);
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    return await database.getAllAsync<Sale>('SELECT * FROM sales WHERE date >= ? AND date <= ? ORDER BY date DESC', [startDate, endDate]);
  } catch (error) {
    console.log('Error getting sales by date range:', error);
    return [];
  }
}

export async function createSale(sale: Omit<Sale, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>): Promise<Sale> {
  const now = new Date().toISOString();
  const newSale: Sale = {
    ...sale,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };

  if (Platform.OS === 'web') {
    const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    sales.push(newSale);
    await setToStorage(STORAGE_KEYS.sales, sales);
    return newSale;
  }

  const database = await ensureDb();
  if (!database) throw new Error('Database not initialized');
  await database.runAsync(
    'INSERT INTO sales (id, name, total, date, createdBy, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [newSale.id, newSale.name, newSale.total, newSale.date, newSale.createdBy, now, now, 'pending']
  );
  return newSale;
}

export async function deleteSale(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    await setToStorage(STORAGE_KEYS.sales, sales.filter(s => s.id !== id));
    return;
  }
  const database = await ensureDb();
  if (!database) return;
  await database.runAsync('DELETE FROM sales WHERE id = ?', [id]);
}

export async function getExpenses(): Promise<Expense[]> {
  if (Platform.OS === 'web') {
    return getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    return await database.getAllAsync<Expense>('SELECT * FROM expenses ORDER BY date DESC, createdAt DESC');
  } catch (error) {
    console.log('Error getting expenses:', error);
    return [];
  }
}

export async function getExpensesByDate(date: string): Promise<Expense[]> {
  if (Platform.OS === 'web') {
    const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    return expenses.filter(e => {
      const normalizedDate = e.date ? e.date.substring(0, 10) : '';
      return normalizedDate === date;
    });
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    return await database.getAllAsync<Expense>('SELECT * FROM expenses WHERE substr(date, 1, 10) = ? ORDER BY createdAt DESC', [date]);
  } catch (error) {
    console.log('Error getting expenses by date:', error);
    return [];
  }
}

export async function getExpensesByDateRange(startDate: string, endDate: string): Promise<Expense[]> {
  if (Platform.OS === 'web') {
    const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    return expenses.filter(e => e.date >= startDate && e.date <= endDate);
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    return await database.getAllAsync<Expense>('SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date DESC', [startDate, endDate]);
  } catch (error) {
    console.log('Error getting expenses by date range:', error);
    return [];
  }
}

export async function createExpense(expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>): Promise<Expense> {
  const now = new Date().toISOString();
  const newExpense: Expense = {
    ...expense,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };

  if (Platform.OS === 'web') {
    const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    expenses.push(newExpense);
    await setToStorage(STORAGE_KEYS.expenses, expenses);
    return newExpense;
  }

  const database = await ensureDb();
  if (!database) throw new Error('Database not initialized');
  await database.runAsync(
    'INSERT INTO expenses (id, name, total, date, createdBy, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [newExpense.id, newExpense.name, newExpense.total, newExpense.date, newExpense.createdBy, now, now, 'pending']
  );
  return newExpense;
}

export async function deleteExpense(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    await setToStorage(STORAGE_KEYS.expenses, expenses.filter(e => e.id !== id));
    return;
  }
  const database = await ensureDb();
  if (!database) return;
  await database.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
}

export async function getActivities(): Promise<Activity[]> {
  if (Platform.OS === 'web') {
    const activities = await getFromStorage<Activity[]>(STORAGE_KEYS.activities, []);
    return activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    return await database.getAllAsync<Activity>('SELECT * FROM activities ORDER BY createdAt DESC LIMIT 50');
  } catch (error) {
    console.log('Error getting activities:', error);
    return [];
  }
}

export async function createActivity(activity: Omit<Activity, 'id' | 'createdAt' | 'syncStatus'>): Promise<Activity> {
  const now = new Date().toISOString();
  const newActivity: Activity = {
    ...activity,
    id: generateId(),
    createdAt: now,
    syncStatus: 'pending',
  };

  if (Platform.OS === 'web') {
    const activities = await getFromStorage<Activity[]>(STORAGE_KEYS.activities, []);
    activities.unshift(newActivity);
    await setToStorage(STORAGE_KEYS.activities, activities.slice(0, 100));
    return newActivity;
  }

  const database = await ensureDb();
  if (!database) throw new Error('Database not initialized');
  await database.runAsync(
    'INSERT INTO activities (id, type, description, userId, createdAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?)',
    [newActivity.id, newActivity.type, newActivity.description, newActivity.userId, now, 'pending']
  );
  return newActivity;
}

export async function getPendingSyncCount(): Promise<number> {
  if (Platform.OS === 'web') {
    const users = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
    const categories = await getFromStorage<Category[]>(STORAGE_KEYS.categories, []);
    const inventory = await getFromStorage<InventoryItem[]>(STORAGE_KEYS.inventory, []);
    const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    const activities = await getFromStorage<Activity[]>(STORAGE_KEYS.activities, []);
    
    return [
      ...users.filter(u => u.syncStatus === 'pending'),
      ...categories.filter(c => c.syncStatus === 'pending'),
      ...inventory.filter(i => i.syncStatus === 'pending'),
      ...sales.filter(s => s.syncStatus === 'pending'),
      ...expenses.filter(e => e.syncStatus === 'pending'),
      ...activities.filter(a => a.syncStatus === 'pending'),
    ].length;
  }

  if (!db) return 0;
  
  const counts = await Promise.all([
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM users WHERE syncStatus = ?', ['pending']),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM categories WHERE syncStatus = ?', ['pending']),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM inventory WHERE syncStatus = ?', ['pending']),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM sales WHERE syncStatus = ?', ['pending']),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM expenses WHERE syncStatus = ?', ['pending']),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM activities WHERE syncStatus = ?', ['pending']),
  ]);

  return counts.reduce((sum, result) => sum + (result?.count || 0), 0);
}

export async function markAllSynced(): Promise<void> {
  if (Platform.OS === 'web') {
    const users = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
    const categories = await getFromStorage<Category[]>(STORAGE_KEYS.categories, []);
    const inventory = await getFromStorage<InventoryItem[]>(STORAGE_KEYS.inventory, []);
    const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    const activities = await getFromStorage<Activity[]>(STORAGE_KEYS.activities, []);

    await setToStorage(STORAGE_KEYS.users, users.map(u => ({ ...u, syncStatus: 'synced' as const })));
    await setToStorage(STORAGE_KEYS.categories, categories.map(c => ({ ...c, syncStatus: 'synced' as const })));
    await setToStorage(STORAGE_KEYS.inventory, inventory.map(i => ({ ...i, syncStatus: 'synced' as const })));
    await setToStorage(STORAGE_KEYS.sales, sales.map(s => ({ ...s, syncStatus: 'synced' as const })));
    await setToStorage(STORAGE_KEYS.expenses, expenses.map(e => ({ ...e, syncStatus: 'synced' as const })));
    await setToStorage(STORAGE_KEYS.activities, activities.map(a => ({ ...a, syncStatus: 'synced' as const })));
    return;
  }

  if (!db) return;

  await db.execAsync(`
    UPDATE users SET syncStatus = 'synced';
    UPDATE categories SET syncStatus = 'synced';
    UPDATE inventory SET syncStatus = 'synced';
    UPDATE sales SET syncStatus = 'synced';
    UPDATE expenses SET syncStatus = 'synced';
    UPDATE activities SET syncStatus = 'synced';
  `);
}

export async function upsertUsersFromServer(serverUsers: User[]): Promise<void> {
  if (serverUsers.length === 0) return;
  console.log(`Upserting ${serverUsers.length} users from server`);

  if (Platform.OS === 'web') {
    const localUsers = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
    const localMap = new Map(localUsers.map(u => [u.id, u]));
    
    for (const serverUser of serverUsers) {
      const local = localMap.get(serverUser.id);
      if (!local) {
        localMap.set(serverUser.id, { ...serverUser, syncStatus: 'synced' });
      } else if (local.syncStatus !== 'pending') {
        localMap.set(serverUser.id, { ...serverUser, syncStatus: 'synced' });
      }
    }
    await setToStorage(STORAGE_KEYS.users, Array.from(localMap.values()));
    return;
  }

  if (!db) return;

  for (const serverUser of serverUsers) {
    const existing = await db.getFirstAsync<User>('SELECT * FROM users WHERE id = ?', [serverUser.id]);
    if (!existing) {
      await db.runAsync(
        'INSERT INTO users (id, name, pin, role, bio, profilePicture, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [serverUser.id, serverUser.name, serverUser.pin, serverUser.role, serverUser.bio || null, serverUser.profilePicture || null, serverUser.createdAt, serverUser.updatedAt, 'synced']
      );
    } else if (existing.syncStatus !== 'pending') {
      await db.runAsync(
        'UPDATE users SET name = ?, pin = ?, role = ?, bio = ?, profilePicture = ?, createdAt = ?, updatedAt = ?, syncStatus = ? WHERE id = ?',
        [serverUser.name, serverUser.pin, serverUser.role, serverUser.bio || null, serverUser.profilePicture || null, serverUser.createdAt, serverUser.updatedAt, 'synced', serverUser.id]
      );
    }
  }
}

export async function upsertCategoriesFromServer(serverCategories: Category[]): Promise<void> {
  if (serverCategories.length === 0) return;
  console.log(`Upserting ${serverCategories.length} categories from server`);

  if (Platform.OS === 'web') {
    let localCategories = await getFromStorage<Category[]>(STORAGE_KEYS.categories, []);
    let inventory = await getFromStorage<InventoryItem[]>(STORAGE_KEYS.inventory, []);
    const localMap = new Map(localCategories.map(c => [c.id, c]));
    
    for (const serverCat of serverCategories) {
      try {
        const serverNorm = serverCat.name.trim().toLowerCase();
        
        const collidingLocal = localCategories.find(
          c => c.name.trim().toLowerCase() === serverNorm && c.id !== serverCat.id
        );
        
        if (collidingLocal) {
          console.log(`Name collision: local "${collidingLocal.name}" (${collidingLocal.id}) vs server "${serverCat.name}" (${serverCat.id}). Server wins.`);
          inventory = inventory.map(item => 
            item.categoryId === collidingLocal.id 
              ? { ...item, categoryId: serverCat.id } 
              : item
          );
          localMap.delete(collidingLocal.id);
          localCategories = localCategories.filter(c => c.id !== collidingLocal.id);
        }
        
        const existingById = localMap.get(serverCat.id);
        if (!existingById) {
          localMap.set(serverCat.id, { ...serverCat, syncStatus: 'synced' });
        } else if (existingById.syncStatus !== 'pending') {
          localMap.set(serverCat.id, { ...serverCat, syncStatus: 'synced' });
        }
      } catch (error) {
        console.log(`Error upserting category ${serverCat.id}: ${error}`);
      }
    }
    
    await setToStorage(STORAGE_KEYS.inventory, inventory);
    await setToStorage(STORAGE_KEYS.categories, Array.from(localMap.values()));
    return;
  }

  if (!db) return;

  for (const serverCat of serverCategories) {
    try {
      const serverNorm = serverCat.name.trim().toLowerCase();
      
      const collidingLocal = await db.getFirstAsync<Category>(
        'SELECT * FROM categories WHERE lower(trim(name)) = ? AND id != ?',
        [serverNorm, serverCat.id]
      );
      
      if (collidingLocal) {
        console.log(`Name collision: local "${collidingLocal.name}" (${collidingLocal.id}) vs server "${serverCat.name}" (${serverCat.id}). Server wins.`);
        await db.runAsync(
          'UPDATE inventory SET categoryId = ? WHERE categoryId = ?',
          [serverCat.id, collidingLocal.id]
        );
        await db.runAsync('DELETE FROM categories WHERE id = ?', [collidingLocal.id]);
      }
      
      const existingById = await db.getFirstAsync<Category>('SELECT * FROM categories WHERE id = ?', [serverCat.id]);
      
      if (!existingById) {
        await db.runAsync(
          'INSERT INTO categories (id, name, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, createdAt = excluded.createdAt, updatedAt = excluded.updatedAt, syncStatus = excluded.syncStatus',
          [serverCat.id, serverCat.name, serverCat.createdAt, serverCat.updatedAt, 'synced']
        );
      } else if (existingById.syncStatus !== 'pending') {
        await db.runAsync(
          'UPDATE categories SET name = ?, createdAt = ?, updatedAt = ?, syncStatus = ? WHERE id = ?',
          [serverCat.name, serverCat.createdAt, serverCat.updatedAt, 'synced', serverCat.id]
        );
      }
    } catch (error) {
      console.log(`Error upserting category ${serverCat.id}: ${error}`);
    }
  }
}

export async function upsertInventoryFromServer(serverItems: InventoryItem[]): Promise<void> {
  if (serverItems.length === 0) return;
  console.log(`Upserting ${serverItems.length} inventory items from server`);

  if (Platform.OS === 'web') {
    const localInventory = await getFromStorage<InventoryItem[]>(STORAGE_KEYS.inventory, []);
    const localMap = new Map(localInventory.map(i => [i.id, i]));
    
    for (const serverItem of serverItems) {
      const local = localMap.get(serverItem.id);
      if (!local) {
        localMap.set(serverItem.id, { ...serverItem, syncStatus: 'synced' });
      } else if (local.syncStatus !== 'pending') {
        localMap.set(serverItem.id, { ...serverItem, syncStatus: 'synced' });
      }
    }
    await setToStorage(STORAGE_KEYS.inventory, Array.from(localMap.values()));
    return;
  }

  if (!db) return;

  for (const serverItem of serverItems) {
    const existing = await db.getFirstAsync<InventoryItem>('SELECT * FROM inventory WHERE id = ?', [serverItem.id]);
    if (!existing) {
      await db.runAsync(
        'INSERT INTO inventory (id, name, categoryId, unit, price, quantity, createdAt, updatedAt, createdBy, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [serverItem.id, serverItem.name, serverItem.categoryId, serverItem.unit, serverItem.price, serverItem.quantity, serverItem.createdAt, serverItem.updatedAt, serverItem.createdBy, 'synced']
      );
    } else if (existing.syncStatus !== 'pending') {
      await db.runAsync(
        'UPDATE inventory SET name = ?, categoryId = ?, unit = ?, price = ?, quantity = ?, createdAt = ?, updatedAt = ?, createdBy = ?, syncStatus = ? WHERE id = ?',
        [serverItem.name, serverItem.categoryId, serverItem.unit, serverItem.price, serverItem.quantity, serverItem.createdAt, serverItem.updatedAt, serverItem.createdBy, 'synced', serverItem.id]
      );
    }
  }
}

export async function upsertSalesFromServer(serverSales: Sale[]): Promise<void> {
  if (serverSales.length === 0) return;
  console.log(`Upserting ${serverSales.length} sales from server`);

  if (Platform.OS === 'web') {
    const localSales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    const localMap = new Map(localSales.map(s => [s.id, s]));
    
    for (const serverSale of serverSales) {
      const local = localMap.get(serverSale.id);
      if (!local) {
        localMap.set(serverSale.id, { ...serverSale, syncStatus: 'synced' });
      } else if (local.syncStatus !== 'pending') {
        localMap.set(serverSale.id, { ...serverSale, syncStatus: 'synced' });
      }
    }
    await setToStorage(STORAGE_KEYS.sales, Array.from(localMap.values()));
    return;
  }

  if (!db) return;

  for (const serverSale of serverSales) {
    const existing = await db.getFirstAsync<Sale>('SELECT * FROM sales WHERE id = ?', [serverSale.id]);
    if (!existing) {
      await db.runAsync(
        'INSERT INTO sales (id, name, total, date, createdBy, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [serverSale.id, serverSale.name, serverSale.total, serverSale.date, serverSale.createdBy, serverSale.createdAt, serverSale.updatedAt, 'synced']
      );
    } else if (existing.syncStatus !== 'pending') {
      await db.runAsync(
        'UPDATE sales SET name = ?, total = ?, date = ?, createdBy = ?, createdAt = ?, updatedAt = ?, syncStatus = ? WHERE id = ?',
        [serverSale.name, serverSale.total, serverSale.date, serverSale.createdBy, serverSale.createdAt, serverSale.updatedAt, 'synced', serverSale.id]
      );
    }
  }
}

export async function upsertExpensesFromServer(serverExpenses: Expense[]): Promise<void> {
  if (serverExpenses.length === 0) return;
  console.log(`Upserting ${serverExpenses.length} expenses from server`);

  if (Platform.OS === 'web') {
    const localExpenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    const localMap = new Map(localExpenses.map(e => [e.id, e]));
    
    for (const serverExpense of serverExpenses) {
      const local = localMap.get(serverExpense.id);
      if (!local) {
        localMap.set(serverExpense.id, { ...serverExpense, syncStatus: 'synced' });
      } else if (local.syncStatus !== 'pending') {
        localMap.set(serverExpense.id, { ...serverExpense, syncStatus: 'synced' });
      }
    }
    await setToStorage(STORAGE_KEYS.expenses, Array.from(localMap.values()));
    return;
  }

  if (!db) return;

  for (const serverExpense of serverExpenses) {
    const existing = await db.getFirstAsync<Expense>('SELECT * FROM expenses WHERE id = ?', [serverExpense.id]);
    if (!existing) {
      await db.runAsync(
        'INSERT INTO expenses (id, name, total, date, createdBy, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [serverExpense.id, serverExpense.name, serverExpense.total, serverExpense.date, serverExpense.createdBy, serverExpense.createdAt, serverExpense.updatedAt, 'synced']
      );
    } else if (existing.syncStatus !== 'pending') {
      await db.runAsync(
        'UPDATE expenses SET name = ?, total = ?, date = ?, createdBy = ?, createdAt = ?, updatedAt = ?, syncStatus = ? WHERE id = ?',
        [serverExpense.name, serverExpense.total, serverExpense.date, serverExpense.createdBy, serverExpense.createdAt, serverExpense.updatedAt, 'synced', serverExpense.id]
      );
    }
  }
}

export async function repairDuplicateCategories(): Promise<void> {
  console.log('Running duplicate categories repair...');

  if (Platform.OS === 'web') {
    const categories = await getFromStorage<Category[]>(STORAGE_KEYS.categories, []);
    const inventory = await getFromStorage<InventoryItem[]>(STORAGE_KEYS.inventory, []);
    
    const groupedByNorm = new Map<string, Category[]>();
    for (const cat of categories) {
      const norm = cat.name.trim().toLowerCase();
      if (!groupedByNorm.has(norm)) {
        groupedByNorm.set(norm, []);
      }
      groupedByNorm.get(norm)!.push(cat);
    }

    const idsToDelete = new Set<string>();
    const idRemapping = new Map<string, string>();

    for (const [, group] of groupedByNorm) {
      if (group.length <= 1) continue;

      group.sort((a, b) => {
        if (a.syncStatus === 'synced' && b.syncStatus !== 'synced') return -1;
        if (b.syncStatus === 'synced' && a.syncStatus !== 'synced') return 1;
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return aTime - bTime;
      });

      const canonical = group[0];
      for (let i = 1; i < group.length; i++) {
        const dup = group[i];
        idsToDelete.add(dup.id);
        idRemapping.set(dup.id, canonical.id);
        console.log(`Duplicate category found: "${dup.name}" (${dup.id}) -> canonical "${canonical.name}" (${canonical.id})`);
      }
    }

    if (idsToDelete.size === 0) {
      console.log('No duplicate categories found');
      return;
    }

    const updatedInventory = inventory.map(item => {
      if (item.categoryId && idRemapping.has(item.categoryId)) {
        return { ...item, categoryId: idRemapping.get(item.categoryId)! };
      }
      return item;
    });

    const filteredCategories = categories.filter(c => !idsToDelete.has(c.id));

    await setToStorage(STORAGE_KEYS.inventory, updatedInventory);
    await setToStorage(STORAGE_KEYS.categories, filteredCategories);

    console.log(`Repaired ${idsToDelete.size} duplicate categories`);
    return;
  }

  if (!db) return;

  const categories = await db.getAllAsync<Category>('SELECT * FROM categories');
  
  const groupedByNorm = new Map<string, Category[]>();
  for (const cat of categories) {
    const norm = cat.name.trim().toLowerCase();
    if (!groupedByNorm.has(norm)) {
      groupedByNorm.set(norm, []);
    }
    groupedByNorm.get(norm)!.push(cat);
  }

  const idsToDelete: string[] = [];
  const idRemapping = new Map<string, string>();

  for (const [, group] of groupedByNorm) {
    if (group.length <= 1) continue;

    group.sort((a, b) => {
      if (a.syncStatus === 'synced' && b.syncStatus !== 'synced') return -1;
      if (b.syncStatus === 'synced' && a.syncStatus !== 'synced') return 1;
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return aTime - bTime;
    });

    const canonical = group[0];
    for (let i = 1; i < group.length; i++) {
      const dup = group[i];
      idsToDelete.push(dup.id);
      idRemapping.set(dup.id, canonical.id);
      console.log(`Duplicate category found: "${dup.name}" (${dup.id}) -> canonical "${canonical.name}" (${canonical.id})`);
    }
  }

  if (idsToDelete.length === 0) {
    console.log('No duplicate categories found');
    return;
  }

  for (const [dupId, canonicalId] of idRemapping) {
    await db.runAsync('UPDATE inventory SET categoryId = ? WHERE categoryId = ?', [canonicalId, dupId]);
  }

  for (const id of idsToDelete) {
    await db.runAsync('DELETE FROM categories WHERE id = ?', [id]);
  }

  console.log(`Repaired ${idsToDelete.length} duplicate categories`);
}

interface ServerUser {
  id: string;
  pin: string;
  role?: string;
  name?: string;
}

interface MigrationOptions {
  serverUsers: ServerUser[];
  fallbackPin?: string;
}

export async function migrateLocalUserIdsToServerIds(options: MigrationOptions): Promise<void> {
  const { serverUsers, fallbackPin } = options;
  
  if (serverUsers.length === 0) {
    console.log('No server users to migrate to');
    return;
  }
  console.log(`Running user ID migration with ${serverUsers.length} server users...`);

  const pinToServerId = new Map<string, string>();
  for (const su of serverUsers) {
    pinToServerId.set(su.pin, su.id);
  }

  const fallbackServerId = fallbackPin ? pinToServerId.get(fallbackPin) : (pinToServerId.get('2345') || serverUsers[0]?.id);
  console.log(`Fallback server ID for orphans: ${fallbackServerId} (pin: ${fallbackPin || '2345 or first'})`);

  if (Platform.OS === 'web') {
    const localUsers = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
    let inventory = await getFromStorage<InventoryItem[]>(STORAGE_KEYS.inventory, []);
    let sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    let expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    let activities = await getFromStorage<Activity[]>(STORAGE_KEYS.activities, []);

    const idRemapping = new Map<string, string>();
    const localIdsToRemove = new Set<string>();
    const validServerIds = new Set(serverUsers.map(su => su.id));

    for (const localUser of localUsers) {
      const matchingServer = serverUsers.find(su => su.pin === localUser.pin);
      if (matchingServer && matchingServer.id !== localUser.id) {
        console.log(`Found matching user by PIN: local "${localUser.id}" -> server "${matchingServer.id}"`);
        idRemapping.set(localUser.id, matchingServer.id);
        localIdsToRemove.add(localUser.id);
      }
    }

    const localUserIds = new Set(localUsers.map(u => u.id));
    let orphanFixCount = 0;

    inventory = inventory.map(item => {
      if (item.createdBy && idRemapping.has(item.createdBy)) {
        return { ...item, createdBy: idRemapping.get(item.createdBy)! };
      }
      if (item.createdBy && !localUserIds.has(item.createdBy) && !validServerIds.has(item.createdBy) && fallbackServerId) {
        console.log(`Fixing orphan inventory ${item.id}: ${item.createdBy} -> ${fallbackServerId}`);
        orphanFixCount++;
        return { ...item, createdBy: fallbackServerId };
      }
      return item;
    });

    sales = sales.map(s => {
      if (s.createdBy && idRemapping.has(s.createdBy)) {
        return { ...s, createdBy: idRemapping.get(s.createdBy)! };
      }
      if (s.createdBy && !localUserIds.has(s.createdBy) && !validServerIds.has(s.createdBy) && fallbackServerId) {
        console.log(`Fixing orphan sale ${s.id}: ${s.createdBy} -> ${fallbackServerId}`);
        orphanFixCount++;
        return { ...s, createdBy: fallbackServerId };
      }
      return s;
    });

    expenses = expenses.map(e => {
      if (e.createdBy && idRemapping.has(e.createdBy)) {
        return { ...e, createdBy: idRemapping.get(e.createdBy)! };
      }
      if (e.createdBy && !localUserIds.has(e.createdBy) && !validServerIds.has(e.createdBy) && fallbackServerId) {
        console.log(`Fixing orphan expense ${e.id}: ${e.createdBy} -> ${fallbackServerId}`);
        orphanFixCount++;
        return { ...e, createdBy: fallbackServerId };
      }
      return e;
    });

    activities = activities.map(a => {
      if (a.userId && idRemapping.has(a.userId)) {
        return { ...a, userId: idRemapping.get(a.userId)! };
      }
      if (a.userId && !localUserIds.has(a.userId) && !validServerIds.has(a.userId) && fallbackServerId) {
        console.log(`Fixing orphan activity ${a.id}: ${a.userId} -> ${fallbackServerId}`);
        orphanFixCount++;
        return { ...a, userId: fallbackServerId };
      }
      return a;
    });

    const updatedUsers = localUsers.filter(u => !localIdsToRemove.has(u.id));
    for (const serverUser of serverUsers) {
      const existsInUpdated = updatedUsers.some(u => u.id === serverUser.id);
      if (!existsInUpdated) {
        const matchedLocal = localUsers.find(u => u.pin === serverUser.pin);
        updatedUsers.push({
          id: serverUser.id,
          name: matchedLocal?.name || serverUser.name || '',
          pin: serverUser.pin,
          role: (serverUser.role as User['role']) || matchedLocal?.role || 'worker',
          bio: matchedLocal?.bio,
          profilePicture: matchedLocal?.profilePicture,
          createdAt: matchedLocal?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          syncStatus: 'synced',
        });
      }
    }

    await setToStorage(STORAGE_KEYS.users, updatedUsers);
    await setToStorage(STORAGE_KEYS.inventory, inventory);
    await setToStorage(STORAGE_KEYS.sales, sales);
    await setToStorage(STORAGE_KEYS.expenses, expenses);
    await setToStorage(STORAGE_KEYS.activities, activities);

    console.log(`Migration complete: ${idRemapping.size} user ID remaps, ${orphanFixCount} orphan fixes`);
    return;
  }

  if (!db) return;

  const localUsers = await db.getAllAsync<User>('SELECT * FROM users');
  const idRemapping = new Map<string, string>();
  const localIdsToRemove: string[] = [];

  for (const localUser of localUsers) {
    const matchingServer = serverUsers.find(su => su.pin === localUser.pin);
    if (matchingServer && matchingServer.id !== localUser.id) {
      console.log(`Found matching user by PIN: local "${localUser.id}" -> server "${matchingServer.id}"`);
      idRemapping.set(localUser.id, matchingServer.id);
      localIdsToRemove.push(localUser.id);
    }
  }

  for (const [localId, serverId] of idRemapping) {
    console.log(`Updating FK references from ${localId} to ${serverId}`);
    await db.runAsync('UPDATE inventory SET createdBy = ? WHERE createdBy = ?', [serverId, localId]);
    await db.runAsync('UPDATE sales SET createdBy = ? WHERE createdBy = ?', [serverId, localId]);
    await db.runAsync('UPDATE expenses SET createdBy = ? WHERE createdBy = ?', [serverId, localId]);
    await db.runAsync('UPDATE activities SET userId = ? WHERE userId = ?', [serverId, localId]);
  }

  for (const localId of localIdsToRemove) {
    await db.runAsync('DELETE FROM users WHERE id = ?', [localId]);
  }

  for (const serverUser of serverUsers) {
    const exists = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM users WHERE id = ?', [serverUser.id]);
    if (!exists || exists.count === 0) {
      const matchedLocal = localUsers.find(u => u.pin === serverUser.pin);
      const now = new Date().toISOString();
      await db.runAsync(
        'INSERT INTO users (id, name, pin, role, bio, profilePicture, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          serverUser.id,
          matchedLocal?.name || serverUser.name || '',
          serverUser.pin,
          serverUser.role || matchedLocal?.role || 'worker',
          matchedLocal?.bio || null,
          matchedLocal?.profilePicture || null,
          matchedLocal?.createdAt || now,
          now,
          'synced'
        ]
      );
    }
  }

  let orphanFixCount = 0;

  if (fallbackServerId) {
    const orphanedInventory = await db.getAllAsync<{ id: string; createdBy: string }>(
      `SELECT id, createdBy FROM inventory WHERE createdBy NOT IN (SELECT id FROM users)`
    );
    for (const item of orphanedInventory) {
      console.log(`Fixing orphan inventory ${item.id}: ${item.createdBy} -> ${fallbackServerId}`);
      await db.runAsync('UPDATE inventory SET createdBy = ? WHERE id = ?', [fallbackServerId, item.id]);
      orphanFixCount++;
    }

    const orphanedSales = await db.getAllAsync<{ id: string; createdBy: string }>(
      `SELECT id, createdBy FROM sales WHERE createdBy NOT IN (SELECT id FROM users)`
    );
    for (const sale of orphanedSales) {
      console.log(`Fixing orphan sale ${sale.id}: ${sale.createdBy} -> ${fallbackServerId}`);
      await db.runAsync('UPDATE sales SET createdBy = ? WHERE id = ?', [fallbackServerId, sale.id]);
      orphanFixCount++;
    }

    const orphanedExpenses = await db.getAllAsync<{ id: string; createdBy: string }>(
      `SELECT id, createdBy FROM expenses WHERE createdBy NOT IN (SELECT id FROM users)`
    );
    for (const expense of orphanedExpenses) {
      console.log(`Fixing orphan expense ${expense.id}: ${expense.createdBy} -> ${fallbackServerId}`);
      await db.runAsync('UPDATE expenses SET createdBy = ? WHERE id = ?', [fallbackServerId, expense.id]);
      orphanFixCount++;
    }

    const orphanedActivities = await db.getAllAsync<{ id: string; userId: string }>(
      `SELECT id, userId FROM activities WHERE userId NOT IN (SELECT id FROM users)`
    );
    for (const activity of orphanedActivities) {
      console.log(`Fixing orphan activity ${activity.id}: ${activity.userId} -> ${fallbackServerId}`);
      await db.runAsync('UPDATE activities SET userId = ? WHERE id = ?', [fallbackServerId, activity.id]);
      orphanFixCount++;
    }
  }

  console.log(`Migration complete: ${idRemapping.size} user ID remaps, ${orphanFixCount} orphan fixes`);
}

export async function resolveUserPinConflict(
  localUserId: string,
  serverUserId: string,
  localUser: User
): Promise<void> {
  if (localUserId === serverUserId) return;
  
  console.log(`Resolving PIN conflict: local ${localUserId} -> server ${serverUserId}`);

  if (Platform.OS === 'web') {
    let users = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
    let inventory = await getFromStorage<InventoryItem[]>(STORAGE_KEYS.inventory, []);
    let sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    let expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    let activities = await getFromStorage<Activity[]>(STORAGE_KEYS.activities, []);

    inventory = inventory.map(item =>
      item.createdBy === localUserId ? { ...item, createdBy: serverUserId } : item
    );
    sales = sales.map(s =>
      s.createdBy === localUserId ? { ...s, createdBy: serverUserId } : s
    );
    expenses = expenses.map(e =>
      e.createdBy === localUserId ? { ...e, createdBy: serverUserId } : e
    );
    activities = activities.map(a =>
      a.userId === localUserId ? { ...a, userId: serverUserId } : a
    );

    users = users.filter(u => u.id !== localUserId);
    const existingServer = users.find(u => u.id === serverUserId);
    if (!existingServer) {
      users.push({
        ...localUser,
        id: serverUserId,
        syncStatus: 'synced',
      });
    }

    await setToStorage(STORAGE_KEYS.users, users);
    await setToStorage(STORAGE_KEYS.inventory, inventory);
    await setToStorage(STORAGE_KEYS.sales, sales);
    await setToStorage(STORAGE_KEYS.expenses, expenses);
    await setToStorage(STORAGE_KEYS.activities, activities);
    return;
  }

  if (!db) return;

  await db.runAsync('UPDATE inventory SET createdBy = ? WHERE createdBy = ?', [serverUserId, localUserId]);
  await db.runAsync('UPDATE sales SET createdBy = ? WHERE createdBy = ?', [serverUserId, localUserId]);
  await db.runAsync('UPDATE expenses SET createdBy = ? WHERE createdBy = ?', [serverUserId, localUserId]);
  await db.runAsync('UPDATE activities SET userId = ? WHERE userId = ?', [serverUserId, localUserId]);

  await db.runAsync('DELETE FROM users WHERE id = ?', [localUserId]);

  const existingServer = await db.getFirstAsync<{ id: string }>('SELECT id FROM users WHERE id = ?', [serverUserId]);
  if (!existingServer) {
    await db.runAsync(
      'INSERT INTO users (id, name, pin, role, bio, profilePicture, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        serverUserId,
        localUser.name,
        localUser.pin,
        localUser.role,
        localUser.bio || null,
        localUser.profilePicture || null,
        localUser.createdAt,
        new Date().toISOString(),
        'synced'
      ]
    );
  }

  console.log(`PIN conflict resolved: ${localUserId} -> ${serverUserId}`);
}

export interface OrphanRepairResult {
  fixedSales: number;
  fixedExpenses: number;
  fixedInventory: number;
  fixedActivities: number;
}

export async function repairOrphanAuthors(fallbackUserId: string): Promise<OrphanRepairResult> {
  console.log(`Repairing orphan authors with fallback user: ${fallbackUserId}`);
  const result: OrphanRepairResult = {
    fixedSales: 0,
    fixedExpenses: 0,
    fixedInventory: 0,
    fixedActivities: 0,
  };

  if (Platform.OS === 'web') {
    const users = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
    const validUserIds = new Set(users.map(u => u.id));

    if (!validUserIds.has(fallbackUserId)) {
      console.log('Fallback user not found in local users, cannot repair orphans');
      return result;
    }

    let inventory = await getFromStorage<InventoryItem[]>(STORAGE_KEYS.inventory, []);
    let sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    let expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    let activities = await getFromStorage<Activity[]>(STORAGE_KEYS.activities, []);

    const now = new Date().toISOString();

    inventory = inventory.map(item => {
      if (item.syncStatus === 'pending' && item.createdBy && !validUserIds.has(item.createdBy)) {
        console.log(`Fixing orphan inventory item ${item.id}: ${item.createdBy} -> ${fallbackUserId}`);
        result.fixedInventory++;
        return { ...item, createdBy: fallbackUserId, updatedAt: now };
      }
      return item;
    });

    sales = sales.map(sale => {
      if (sale.syncStatus === 'pending' && sale.createdBy && !validUserIds.has(sale.createdBy)) {
        console.log(`Fixing orphan sale ${sale.id}: ${sale.createdBy} -> ${fallbackUserId}`);
        result.fixedSales++;
        return { ...sale, createdBy: fallbackUserId, updatedAt: now };
      }
      return sale;
    });

    expenses = expenses.map(expense => {
      if (expense.syncStatus === 'pending' && expense.createdBy && !validUserIds.has(expense.createdBy)) {
        console.log(`Fixing orphan expense ${expense.id}: ${expense.createdBy} -> ${fallbackUserId}`);
        result.fixedExpenses++;
        return { ...expense, createdBy: fallbackUserId, updatedAt: now };
      }
      return expense;
    });

    activities = activities.map(activity => {
      if (activity.syncStatus === 'pending' && activity.userId && !validUserIds.has(activity.userId)) {
        console.log(`Fixing orphan activity ${activity.id}: ${activity.userId} -> ${fallbackUserId}`);
        result.fixedActivities++;
        return { ...activity, userId: fallbackUserId };
      }
      return activity;
    });

    await setToStorage(STORAGE_KEYS.inventory, inventory);
    await setToStorage(STORAGE_KEYS.sales, sales);
    await setToStorage(STORAGE_KEYS.expenses, expenses);
    await setToStorage(STORAGE_KEYS.activities, activities);

    console.log(`Orphan repair complete (web): ${result.fixedInventory} inventory, ${result.fixedSales} sales, ${result.fixedExpenses} expenses, ${result.fixedActivities} activities`);
    return result;
  }

  if (!db) return result;

  const users = await db.getAllAsync<{ id: string }>('SELECT id FROM users');
  const validUserIds = new Set(users.map(u => u.id));

  if (!validUserIds.has(fallbackUserId)) {
    console.log('Fallback user not found in local users, cannot repair orphans');
    return result;
  }

  const now = new Date().toISOString();

  const orphanedInventory = await db.getAllAsync<{ id: string; createdBy: string }>(
    `SELECT id, createdBy FROM inventory WHERE syncStatus = 'pending' AND createdBy NOT IN (SELECT id FROM users)`
  );
  for (const item of orphanedInventory) {
    console.log(`Fixing orphan inventory item ${item.id}: ${item.createdBy} -> ${fallbackUserId}`);
    await db.runAsync('UPDATE inventory SET createdBy = ?, updatedAt = ? WHERE id = ?', [fallbackUserId, now, item.id]);
    result.fixedInventory++;
  }

  const orphanedSales = await db.getAllAsync<{ id: string; createdBy: string }>(
    `SELECT id, createdBy FROM sales WHERE syncStatus = 'pending' AND createdBy NOT IN (SELECT id FROM users)`
  );
  for (const sale of orphanedSales) {
    console.log(`Fixing orphan sale ${sale.id}: ${sale.createdBy} -> ${fallbackUserId}`);
    await db.runAsync('UPDATE sales SET createdBy = ?, updatedAt = ? WHERE id = ?', [fallbackUserId, now, sale.id]);
    result.fixedSales++;
  }

  const orphanedExpenses = await db.getAllAsync<{ id: string; createdBy: string }>(
    `SELECT id, createdBy FROM expenses WHERE syncStatus = 'pending' AND createdBy NOT IN (SELECT id FROM users)`
  );
  for (const expense of orphanedExpenses) {
    console.log(`Fixing orphan expense ${expense.id}: ${expense.createdBy} -> ${fallbackUserId}`);
    await db.runAsync('UPDATE expenses SET createdBy = ?, updatedAt = ? WHERE id = ?', [fallbackUserId, now, expense.id]);
    result.fixedExpenses++;
  }

  const orphanedActivities = await db.getAllAsync<{ id: string; userId: string }>(
    `SELECT id, userId FROM activities WHERE syncStatus = 'pending' AND userId NOT IN (SELECT id FROM users)`
  );
  for (const activity of orphanedActivities) {
    console.log(`Fixing orphan activity ${activity.id}: ${activity.userId} -> ${fallbackUserId}`);
    await db.runAsync('UPDATE activities SET userId = ? WHERE id = ?', [fallbackUserId, activity.id]);
    result.fixedActivities++;
  }

  console.log(`Orphan repair complete: ${result.fixedInventory} inventory, ${result.fixedSales} sales, ${result.fixedExpenses} expenses, ${result.fixedActivities} activities`);
  return result;
}

export interface PendingSummary {
  totals: {
    users: number;
    categories: number;
    inventory: number;
    sales: number;
    expenses: number;
    activities: number;
    deletions: number;
    total: number;
  };
  itemsByTable: {
    users: { id: string; pin: string; name: string; role: string; syncStatus: string; updatedAt: string }[];
    categories: { id: string; name: string; syncStatus: string; updatedAt: string }[];
    inventory: { id: string; name: string; createdBy: string; categoryId: string; syncStatus: string; updatedAt: string }[];
    sales: { id: string; name: string; total: number; createdBy: string; date: string; syncStatus: string; updatedAt: string }[];
    expenses: { id: string; name: string; total: number; createdBy: string; date: string; syncStatus: string; updatedAt: string }[];
    activities: { id: string; type: string; description: string; userId: string; syncStatus: string; createdAt: string }[];
  };
}

export async function getPendingSummaryAndItems(limitPerTable = 50): Promise<PendingSummary> {
  const result: PendingSummary = {
    totals: { users: 0, categories: 0, inventory: 0, sales: 0, expenses: 0, activities: 0, deletions: 0, total: 0 },
    itemsByTable: { users: [], categories: [], inventory: [], sales: [], expenses: [], activities: [] },
  };

  try {
    if (Platform.OS === 'web') {
      const users = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
      const categories = await getFromStorage<Category[]>(STORAGE_KEYS.categories, []);
      const inventory = await getFromStorage<InventoryItem[]>(STORAGE_KEYS.inventory, []);
      const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
      const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
      const activities = await getFromStorage<Activity[]>(STORAGE_KEYS.activities, []);

      const pendingUsers = users.filter(u => u.syncStatus === 'pending');
      const pendingCategories = categories.filter(c => c.syncStatus === 'pending');
      const pendingInventory = inventory.filter(i => i.syncStatus === 'pending');
      const pendingSales = sales.filter(s => s.syncStatus === 'pending');
      const pendingExpenses = expenses.filter(e => e.syncStatus === 'pending');
      const pendingActivities = activities.filter(a => a.syncStatus === 'pending');

      result.totals.users = pendingUsers.length;
      result.totals.categories = pendingCategories.length;
      result.totals.inventory = pendingInventory.length;
      result.totals.sales = pendingSales.length;
      result.totals.expenses = pendingExpenses.length;
      result.totals.activities = pendingActivities.length;
      result.totals.total = pendingUsers.length + pendingCategories.length + pendingInventory.length + pendingSales.length + pendingExpenses.length + pendingActivities.length;

      result.itemsByTable.users = pendingUsers.slice(0, limitPerTable).map(u => ({
        id: u.id, pin: u.pin, name: u.name, role: u.role, syncStatus: u.syncStatus || 'pending', updatedAt: u.updatedAt,
      }));
      result.itemsByTable.categories = pendingCategories.slice(0, limitPerTable).map(c => ({
        id: c.id, name: c.name, syncStatus: c.syncStatus || 'pending', updatedAt: c.updatedAt,
      }));
      result.itemsByTable.inventory = pendingInventory.slice(0, limitPerTable).map(i => ({
        id: i.id, name: i.name, createdBy: i.createdBy, categoryId: i.categoryId || '', syncStatus: i.syncStatus || 'pending', updatedAt: i.updatedAt,
      }));
      result.itemsByTable.sales = pendingSales.slice(0, limitPerTable).map(s => ({
        id: s.id, name: s.name, total: s.total, createdBy: s.createdBy, date: s.date, syncStatus: s.syncStatus || 'pending', updatedAt: s.updatedAt,
      }));
      result.itemsByTable.expenses = pendingExpenses.slice(0, limitPerTable).map(e => ({
        id: e.id, name: e.name, total: e.total, createdBy: e.createdBy, date: e.date, syncStatus: e.syncStatus || 'pending', updatedAt: e.updatedAt,
      }));
      result.itemsByTable.activities = pendingActivities.slice(0, limitPerTable).map(a => ({
        id: a.id, type: a.type, description: a.description, userId: a.userId, syncStatus: a.syncStatus || 'pending', createdAt: a.createdAt,
      }));

      return result;
    }

    if (!db) return result;

    const [usersCount, categoriesCount, inventoryCount, salesCount, expensesCount, activitiesCount] = await Promise.all([
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM users WHERE syncStatus = ?', ['pending']),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM categories WHERE syncStatus = ?', ['pending']),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM inventory WHERE syncStatus = ?', ['pending']),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM sales WHERE syncStatus = ?', ['pending']),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM expenses WHERE syncStatus = ?', ['pending']),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM activities WHERE syncStatus = ?', ['pending']),
    ]);

    result.totals.users = usersCount?.count || 0;
    result.totals.categories = categoriesCount?.count || 0;
    result.totals.inventory = inventoryCount?.count || 0;
    result.totals.sales = salesCount?.count || 0;
    result.totals.expenses = expensesCount?.count || 0;
    result.totals.activities = activitiesCount?.count || 0;
    result.totals.total = result.totals.users + result.totals.categories + result.totals.inventory + result.totals.sales + result.totals.expenses + result.totals.activities;

    const [pendingUsers, pendingCategories, pendingInventory, pendingSales, pendingExpenses, pendingActivities] = await Promise.all([
      db.getAllAsync<User>(`SELECT * FROM users WHERE syncStatus = 'pending' LIMIT ?`, [limitPerTable]),
      db.getAllAsync<Category>(`SELECT * FROM categories WHERE syncStatus = 'pending' LIMIT ?`, [limitPerTable]),
      db.getAllAsync<InventoryItem>(`SELECT * FROM inventory WHERE syncStatus = 'pending' LIMIT ?`, [limitPerTable]),
      db.getAllAsync<Sale>(`SELECT * FROM sales WHERE syncStatus = 'pending' LIMIT ?`, [limitPerTable]),
      db.getAllAsync<Expense>(`SELECT * FROM expenses WHERE syncStatus = 'pending' LIMIT ?`, [limitPerTable]),
      db.getAllAsync<Activity>(`SELECT * FROM activities WHERE syncStatus = 'pending' LIMIT ?`, [limitPerTable]),
    ]);

    result.itemsByTable.users = pendingUsers.map(u => ({
      id: u.id, pin: u.pin, name: u.name, role: u.role, syncStatus: u.syncStatus || 'pending', updatedAt: u.updatedAt,
    }));
    result.itemsByTable.categories = pendingCategories.map(c => ({
      id: c.id, name: c.name, syncStatus: c.syncStatus || 'pending', updatedAt: c.updatedAt,
    }));
    result.itemsByTable.inventory = pendingInventory.map(i => ({
      id: i.id, name: i.name, createdBy: i.createdBy, categoryId: i.categoryId || '', syncStatus: i.syncStatus || 'pending', updatedAt: i.updatedAt,
    }));
    result.itemsByTable.sales = pendingSales.map(s => ({
      id: s.id, name: s.name, total: s.total, createdBy: s.createdBy, date: s.date, syncStatus: s.syncStatus || 'pending', updatedAt: s.updatedAt,
    }));
    result.itemsByTable.expenses = pendingExpenses.map(e => ({
      id: e.id, name: e.name, total: e.total, createdBy: e.createdBy, date: e.date, syncStatus: e.syncStatus || 'pending', updatedAt: e.updatedAt,
    }));
    result.itemsByTable.activities = pendingActivities.map(a => ({
      id: a.id, type: a.type, description: a.description, userId: a.userId, syncStatus: a.syncStatus || 'pending', createdAt: a.createdAt,
    }));

    return result;
  } catch (error) {
    console.log('Error getting pending summary:', error);
    return result;
  }
}

export async function getEntryDaysForMonth(year: number, month: number): Promise<string[]> {
  const monthStr = String(month).padStart(2, '0');
  const datePrefix = `${year}-${monthStr}`;
  
  try {
    if (Platform.OS === 'web') {
      const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
      const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
      
      const datesSet = new Set<string>();
      
      for (const sale of sales) {
        if (sale.date && sale.date.startsWith(datePrefix)) {
          datesSet.add(sale.date);
        }
      }
      
      for (const expense of expenses) {
        if (expense.date && expense.date.startsWith(datePrefix)) {
          datesSet.add(expense.date);
        }
      }
      
      return Array.from(datesSet);
    }

    if (!db) return [];

    const salesDates = await db.getAllAsync<{ date: string }>(
      `SELECT DISTINCT date FROM sales WHERE date LIKE ?`,
      [`${datePrefix}%`]
    );
    
    const expensesDates = await db.getAllAsync<{ date: string }>(
      `SELECT DISTINCT date FROM expenses WHERE date LIKE ?`,
      [`${datePrefix}%`]
    );
    
    const datesSet = new Set<string>();
    for (const row of salesDates) {
      if (row.date) datesSet.add(row.date);
    }
    for (const row of expensesDates) {
      if (row.date) datesSet.add(row.date);
    }
    
    return Array.from(datesSet);
  } catch (error) {
    console.log('Error getting entry days for month:', error);
    return [];
  }
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getWeeklySalesTotals(startDate: string, endDate: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  
  if (Platform.OS === 'web') {
    const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    for (const sale of sales) {
      const normalizedDate = sale.date ? sale.date.substring(0, 10) : '';
      if (normalizedDate >= startDate && normalizedDate <= endDate) {
        result[normalizedDate] = (result[normalizedDate] || 0) + Number(sale.total);
      }
    }
    console.log(`Web weekly sales totals (${startDate} to ${endDate}):`, result);
    return result;
  }
  
  const database = await ensureDb();
  if (!database) return result;
  
  try {
    const rows = await database.getAllAsync<{ day: string; total: number }>(
      `SELECT substr(date, 1, 10) as day, SUM(total) as total FROM sales WHERE date >= ? AND date <= ? GROUP BY substr(date, 1, 10)`,
      [startDate, endDate]
    );
    for (const row of rows) {
      result[row.day] = row.total || 0;
    }
  } catch (error) {
    console.log('Error getting weekly sales totals:', error);
  }
  
  return result;
}

export async function getWeeklyExpenseTotals(startDate: string, endDate: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  
  if (Platform.OS === 'web') {
    const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    for (const expense of expenses) {
      const normalizedDate = expense.date ? expense.date.substring(0, 10) : '';
      if (normalizedDate >= startDate && normalizedDate <= endDate) {
        result[normalizedDate] = (result[normalizedDate] || 0) + Number(expense.total);
      }
    }
    console.log(`Web weekly expense totals (${startDate} to ${endDate}):`, result);
    return result;
  }
  
  const database = await ensureDb();
  if (!database) return result;
  
  try {
    const rows = await database.getAllAsync<{ day: string; total: number }>(
      `SELECT substr(date, 1, 10) as day, SUM(total) as total FROM expenses WHERE date >= ? AND date <= ? GROUP BY substr(date, 1, 10)`,
      [startDate, endDate]
    );
    for (const row of rows) {
      result[row.day] = row.total || 0;
    }
  } catch (error) {
    console.log('Error getting weekly expense totals:', error);
  }
  
  return result;
}

export async function upsertActivitiesFromServer(serverActivities: Activity[]): Promise<void> {
  if (serverActivities.length === 0) return;
  console.log(`Upserting ${serverActivities.length} activities from server`);

  if (Platform.OS === 'web') {
    const localActivities = await getFromStorage<Activity[]>(STORAGE_KEYS.activities, []);
    const localMap = new Map(localActivities.map(a => [a.id, a]));
    
    for (const serverActivity of serverActivities) {
      const local = localMap.get(serverActivity.id);
      if (!local) {
        localMap.set(serverActivity.id, { ...serverActivity, syncStatus: 'synced' });
      } else if (local.syncStatus !== 'pending') {
        localMap.set(serverActivity.id, { ...serverActivity, syncStatus: 'synced' });
      }
    }
    const sortedActivities = Array.from(localMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ).slice(0, 100);
    await setToStorage(STORAGE_KEYS.activities, sortedActivities);
    return;
  }

  if (!db) return;

  for (const serverActivity of serverActivities) {
    const existing = await db.getFirstAsync<Activity>('SELECT * FROM activities WHERE id = ?', [serverActivity.id]);
    if (!existing) {
      await db.runAsync(
        'INSERT INTO activities (id, type, description, userId, createdAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?)',
        [serverActivity.id, serverActivity.type, serverActivity.description, serverActivity.userId, serverActivity.createdAt, 'synced']
      );
    } else if (existing.syncStatus !== 'pending') {
      await db.runAsync(
        'UPDATE activities SET type = ?, description = ?, userId = ?, createdAt = ?, syncStatus = ? WHERE id = ?',
        [serverActivity.type, serverActivity.description, serverActivity.userId, serverActivity.createdAt, 'synced', serverActivity.id]
      );
    }
  }
}
