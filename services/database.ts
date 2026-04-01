import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  User,
  Sale,
  Expense,
  ExpenseItem,
  Activity,
  ChatMessage,
  DEFAULT_USERS,
  generateId,
  OutboxItem,
  OutboxEntityType,
  OutboxStatus,
} from '@/types';
import { bucketByLocalDay, getDayKeysForWeek, parseLocalDateString, toLocalDayKey } from '@/services/dateUtils';

let db: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<void> | null = null;
let dbInitialized = false;

const STORAGE_KEYS = {
  users: '@myfoodcart_users',
  sales: '@myfoodcart_sales',
  expenses: '@myfoodcart_expenses',
  activities: '@myfoodcart_activities',
  chatMessages: '@myfoodcart_chat_messages',
  outbox: '@myfoodcart_outbox',
  settings: '@myfoodcart_settings',
};

const LEGACY_STORAGE_KEYS = {
  categories: '@myfoodcart_categories',
  inventory: '@myfoodcart_inventory',
  inventoryCleanup: '@myfoodcart_inventory_cleanup_v1',
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

type SaleRow = Omit<Sale, 'items'> & { items?: string | null };
type ExpenseRow = Omit<Expense, 'items'> & { items?: string | null };
type ChatMessageRow = ChatMessage;
type OutboxRow = Omit<OutboxItem, 'syncStatus'> & { syncStatus?: string | null };

export function serializeItems(items?: Array<string | ExpenseItem> | null): string {
  const normalized = Array.isArray(items) ? items : [];
  return JSON.stringify(normalized);
}

export function parseItems(itemsText?: string | null): string[] {
  if (!itemsText) return [];
  try {
    const parsed = JSON.parse(itemsText);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch (error) {
    console.log('Error parsing items JSON:', error);
    return [];
  }
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

export function parseExpenseItems(itemsText?: string | null): ExpenseItem[] {
  if (!itemsText) return [];
  try {
    const parsed = JSON.parse(itemsText);
    return normalizeExpenseItems(parsed);
  } catch (error) {
    console.log('Error parsing expense items JSON:', error);
    return [];
  }
}

function normalizeSale(sale: Sale): Sale {
  return {
    ...sale,
    name: sale.name ?? '',
    items: Array.isArray(sale.items) ? sale.items : [],
  };
}

function normalizeSaleRow(row: SaleRow): Sale {
  return {
    ...row,
    name: row.name ?? '',
    items: parseItems(row.items),
  };
}

function normalizeExpense(expense: Expense): Expense {
  return {
    ...expense,
    name: expense.name ?? '',
    items: normalizeExpenseItems(expense.items),
  };
}

function normalizeExpenseRow(row: ExpenseRow): Expense {
  return {
    ...row,
    name: row.name ?? '',
    items: parseExpenseItems(row.items),
  };
}

function normalizeChatMessage(message: ChatMessageRow): ChatMessage {
  return {
    ...message,
    userName: message.userName?.trim() || 'Unknown User',
    userAvatarUrl: message.userAvatarUrl ?? null,
    localAvatarUri: message.localAvatarUri ?? null,
    messageText: message.messageText ?? '',
  };
}

function getChatMessagePreview(messageText: string): string {
  return messageText.trim().replace(/\s+/g, ' ').slice(0, 80);
}

function normalizeOutboxRow(row: OutboxRow): OutboxItem {
  const normalizedStatus: OutboxStatus = (() => {
    if (row.syncStatus === 'error') return 'failed';
    if (row.syncStatus === 'failed') return 'failed';
    if (row.syncStatus === 'in_progress') return 'in_progress';
    if (row.syncStatus === 'done') return 'done';
    return 'pending';
  })();

  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    operation: row.operation,
    createdAt: row.createdAt,
    syncStatus: normalizedStatus,
    name: row.name ?? null,
    amount: typeof row.amount === 'number' ? row.amount : null,
    date: row.date ?? null,
  };
}

async function enqueueOutboxUpsert(
  entityType: OutboxEntityType,
  entityId: string,
  metadata?: { name?: string; amount?: number | null; date?: string | null }
): Promise<OutboxItem | null> {
  const now = new Date().toISOString();

  if (Platform.OS === 'web') {
    const outbox = await getFromStorage<OutboxItem[]>(STORAGE_KEYS.outbox, []);
    const existingDeleteIndex = outbox.findIndex(item => item.entityType === entityType && item.entityId === entityId && item.operation === 'delete');
    if (existingDeleteIndex >= 0) {
      const existingDelete = normalizeOutboxRow(outbox[existingDeleteIndex]);
      if (existingDelete.syncStatus === 'pending') {
        outbox.splice(existingDeleteIndex, 1);
      }
    }

    const existingUpsertIndex = outbox.findIndex(item => item.entityType === entityType && item.entityId === entityId && item.operation === 'upsert');
    if (existingUpsertIndex >= 0) {
      const existingUpsert = normalizeOutboxRow(outbox[existingUpsertIndex]);
      if (existingUpsert.syncStatus === 'pending') {
        const updated: OutboxItem = {
          ...existingUpsert,
          createdAt: now,
          name: metadata?.name ?? existingUpsert.name ?? null,
          amount: typeof metadata?.amount === 'number' ? metadata.amount : existingUpsert.amount ?? null,
          date: metadata?.date ?? existingUpsert.date ?? null,
          syncStatus: 'pending',
        };
        outbox[existingUpsertIndex] = updated;
        await setToStorage(STORAGE_KEYS.outbox, outbox);
        return updated;
      }
    }

    const newItem: OutboxItem = {
      id: generateId(),
      entityType,
      entityId,
      operation: 'upsert',
      createdAt: now,
      syncStatus: 'pending',
      name: metadata?.name ?? null,
      amount: typeof metadata?.amount === 'number' ? metadata.amount : null,
      date: metadata?.date ?? null,
    };
    outbox.unshift(newItem);
    await setToStorage(STORAGE_KEYS.outbox, outbox);
    return newItem;
  }

  const database = await ensureDb();
  if (!database) return null;
  try {
    const existingDelete = await database.getFirstAsync<OutboxRow>(
      'SELECT * FROM outbox WHERE entityType = ? AND entityId = ? AND operation = ? LIMIT 1',
      [entityType, entityId, 'delete']
    );
    if (existingDelete) {
      const normalizedDelete = normalizeOutboxRow(existingDelete);
      if (normalizedDelete.syncStatus === 'pending') {
        await database.runAsync('DELETE FROM outbox WHERE id = ?', [normalizedDelete.id]);
      }
    }

    const existingUpsert = await database.getFirstAsync<OutboxRow>(
      'SELECT * FROM outbox WHERE entityType = ? AND entityId = ? AND operation = ? LIMIT 1',
      [entityType, entityId, 'upsert']
    );
    if (existingUpsert) {
      const normalizedUpsert = normalizeOutboxRow(existingUpsert);
      if (normalizedUpsert.syncStatus === 'pending') {
        await database.runAsync(
          'UPDATE outbox SET createdAt = ?, syncStatus = ?, name = ?, amount = ?, date = ? WHERE id = ?',
          [
            now,
            'pending',
            metadata?.name ?? normalizedUpsert.name ?? null,
            typeof metadata?.amount === 'number' ? metadata.amount : normalizedUpsert.amount ?? null,
            metadata?.date ?? normalizedUpsert.date ?? null,
            normalizedUpsert.id,
          ]
        );
        return {
          ...normalizedUpsert,
          createdAt: now,
          syncStatus: 'pending',
          name: metadata?.name ?? normalizedUpsert.name ?? null,
          amount: typeof metadata?.amount === 'number' ? metadata.amount : normalizedUpsert.amount ?? null,
          date: metadata?.date ?? normalizedUpsert.date ?? null,
        };
      }
    }

    const id = generateId();
    await database.runAsync(
      'INSERT INTO outbox (id, entityType, entityId, operation, createdAt, syncStatus, name, amount, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        entityType,
        entityId,
        'upsert',
        now,
        'pending',
        metadata?.name ?? null,
        typeof metadata?.amount === 'number' ? metadata.amount : null,
        metadata?.date ?? null,
      ]
    );
    return {
      id,
      entityType,
      entityId,
      operation: 'upsert',
      createdAt: now,
      syncStatus: 'pending',
      name: metadata?.name ?? null,
      amount: typeof metadata?.amount === 'number' ? metadata.amount : null,
      date: metadata?.date ?? null,
    };
  } catch (error) {
    console.log('Error enqueueing upsert:', error);
    return null;
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

async function ensureItemsColumn(table: 'sales' | 'expenses'): Promise<void> {
  if (!db) return;
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  const hasItems = columns.some(column => column.name === 'items');
  if (!hasItems) {
    await db.runAsync(`ALTER TABLE ${table} ADD COLUMN items TEXT`);
  }
}

async function cleanupLegacyInventoryData(): Promise<void> {
  if (Platform.OS === 'web') {
    const alreadyCleaned = await AsyncStorage.getItem(LEGACY_STORAGE_KEYS.inventoryCleanup);
    if (alreadyCleaned === 'true') {
      return;
    }

    await AsyncStorage.removeItem(LEGACY_STORAGE_KEYS.categories);
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEYS.inventory);

    const outbox = await getFromStorage<OutboxItem[]>(STORAGE_KEYS.outbox, []);
    const cleanedOutbox = outbox.filter(
      item => {
        const entityType = item.entityType as string;
        return entityType !== 'category' && entityType !== 'inventory';
      }
    );
    if (cleanedOutbox.length !== outbox.length) {
      await setToStorage(STORAGE_KEYS.outbox, cleanedOutbox);
    }

    await AsyncStorage.setItem(LEGACY_STORAGE_KEYS.inventoryCleanup, 'true');
    return;
  }

  if (!db) return;

  await db.execAsync(`
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS inventory;
    DELETE FROM outbox WHERE entityType IN ('category', 'inventory');
  `);
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

      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        items TEXT,
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
        items TEXT,
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

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        userName TEXT NOT NULL,
        userAvatarUrl TEXT,
        localAvatarUri TEXT,
        messageText TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncStatus TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        entityType TEXT NOT NULL,
        entityId TEXT NOT NULL,
        operation TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        syncStatus TEXT DEFAULT 'pending',
        name TEXT,
        amount REAL,
        date TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_chat_messages_createdAt ON chat_messages(createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_userId ON chat_messages(userId);
    `);

      await ensureItemsColumn('sales');
      await ensureItemsColumn('expenses');
      await cleanupLegacyInventoryData();

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
  await cleanupLegacyInventoryData();
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
  await setToStorage(STORAGE_KEYS.sales, []);
  await setToStorage(STORAGE_KEYS.expenses, []);
  await setToStorage(STORAGE_KEYS.activities, []);
  await setToStorage(STORAGE_KEYS.chatMessages, []);
  await setToStorage(STORAGE_KEYS.outbox, []);
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

export async function getChatMessages(options?: {
  limit?: number;
  beforeCreatedAt?: string | null;
}): Promise<ChatMessage[]> {
  const limit = options?.limit ?? 50;
  const beforeCreatedAt = options?.beforeCreatedAt ?? null;

  if (Platform.OS === 'web') {
    const messages = await getFromStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, []);
    return messages
      .map(normalizeChatMessage)
      .filter(message => !beforeCreatedAt || message.createdAt < beforeCreatedAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  const database = await ensureDb();
  if (!database) return [];
  try {
    if (beforeCreatedAt) {
      const rows = await database.getAllAsync<ChatMessageRow>(
        'SELECT * FROM chat_messages WHERE createdAt < ? ORDER BY createdAt DESC LIMIT ?',
        [beforeCreatedAt, limit]
      );
      return rows.map(normalizeChatMessage);
    }

    const rows = await database.getAllAsync<ChatMessageRow>(
      'SELECT * FROM chat_messages ORDER BY createdAt DESC LIMIT ?',
      [limit]
    );
    return rows.map(normalizeChatMessage);
  } catch (error) {
    console.log('Error getting chat messages:', error);
    return [];
  }
}

export async function getChatMessageCount(): Promise<number> {
  if (Platform.OS === 'web') {
    const messages = await getFromStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, []);
    return messages.length;
  }

  const database = await ensureDb();
  if (!database) return 0;
  try {
    const result = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM chat_messages'
    );
    return result?.count || 0;
  } catch (error) {
    console.log('Error getting chat message count:', error);
    return 0;
  }
}

export async function createChatMessage(
  message: Omit<ChatMessage, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>
): Promise<ChatMessage> {
  const now = new Date().toISOString();
  const trimmedText = message.messageText.trim();
  if (!trimmedText) {
    throw new Error('Message cannot be empty');
  }
  const newMessage: ChatMessage = {
    ...message,
    id: generateId(),
    userName: message.userName.trim(),
    userAvatarUrl: message.userAvatarUrl ?? null,
    localAvatarUri: message.localAvatarUri ?? null,
    messageText: trimmedText,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };

  if (Platform.OS === 'web') {
    const messages = await getFromStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, []);
    messages.unshift(newMessage);
    await setToStorage(STORAGE_KEYS.chatMessages, messages);
    await enqueueOutboxUpsert('chat_message', newMessage.id, {
      name: getChatMessagePreview(newMessage.messageText),
      date: newMessage.createdAt,
    });
    return newMessage;
  }

  const database = await ensureDb();
  if (!database) throw new Error('Database not initialized');
  await database.runAsync(
    'INSERT INTO chat_messages (id, userId, userName, userAvatarUrl, localAvatarUri, messageText, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      newMessage.id,
      newMessage.userId,
      newMessage.userName,
      newMessage.userAvatarUrl ?? null,
      newMessage.localAvatarUri ?? null,
      newMessage.messageText,
      now,
      now,
      'pending',
    ]
  );
  await enqueueOutboxUpsert('chat_message', newMessage.id, {
    name: getChatMessagePreview(newMessage.messageText),
    date: newMessage.createdAt,
  });
  return newMessage;
}

export async function deleteChatMessage(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    const messages = await getFromStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, []);
    await setToStorage(STORAGE_KEYS.chatMessages, messages.filter(message => message.id !== id));
    return;
  }

  const database = await ensureDb();
  if (!database) return;
  await database.runAsync('DELETE FROM chat_messages WHERE id = ?', [id]);
}

export async function getSales(): Promise<Sale[]> {
  if (Platform.OS === 'web') {
    const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    return sales.map(normalizeSale);
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    const rows = await database.getAllAsync<SaleRow>('SELECT * FROM sales ORDER BY date DESC, createdAt DESC');
    return rows.map(normalizeSaleRow);
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
    }).map(normalizeSale);
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    const rows = await database.getAllAsync<SaleRow>('SELECT * FROM sales WHERE substr(date, 1, 10) = ? ORDER BY createdAt DESC', [date]);
    return rows.map(normalizeSaleRow);
  } catch (error) {
    console.log('Error getting sales by date:', error);
    return [];
  }
}

export async function getSalesByDateRange(startDate: string, endDate: string): Promise<Sale[]> {
  if (Platform.OS === 'web') {
    const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    return sales.filter(s => s.date >= startDate && s.date <= endDate).map(normalizeSale);
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    const rows = await database.getAllAsync<SaleRow>('SELECT * FROM sales WHERE date >= ? AND date <= ? ORDER BY date DESC', [startDate, endDate]);
    return rows.map(normalizeSaleRow);
  } catch (error) {
    console.log('Error getting sales by date range:', error);
    return [];
  }
}

export async function createSale(sale: Omit<Sale, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>): Promise<Sale> {
  const now = new Date().toISOString();
  const newSale: Sale = {
    ...sale,
    name: sale.name ?? '',
    items: Array.isArray(sale.items) ? sale.items : [],
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };

  if (Platform.OS === 'web') {
    const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    sales.push(newSale);
    await setToStorage(STORAGE_KEYS.sales, sales);
    await enqueueOutboxUpsert('sale', newSale.id, {
      name: newSale.name,
      amount: newSale.total,
      date: newSale.date,
    });
    return newSale;
  }

  const database = await ensureDb();
  if (!database) throw new Error('Database not initialized');
  await database.runAsync(
    'INSERT INTO sales (id, name, items, total, date, createdBy, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [newSale.id, newSale.name, serializeItems(newSale.items), newSale.total, newSale.date, newSale.createdBy, now, now, 'pending']
  );
  await enqueueOutboxUpsert('sale', newSale.id, {
    name: newSale.name,
    amount: newSale.total,
    date: newSale.date,
  });
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
    const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    return expenses.map(normalizeExpense);
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    const rows = await database.getAllAsync<ExpenseRow>('SELECT * FROM expenses ORDER BY date DESC, createdAt DESC');
    return rows.map(normalizeExpenseRow);
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
    }).map(normalizeExpense);
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    const rows = await database.getAllAsync<ExpenseRow>('SELECT * FROM expenses WHERE substr(date, 1, 10) = ? ORDER BY createdAt DESC', [date]);
    return rows.map(normalizeExpenseRow);
  } catch (error) {
    console.log('Error getting expenses by date:', error);
    return [];
  }
}

export async function getExpensesByDateRange(startDate: string, endDate: string): Promise<Expense[]> {
  if (Platform.OS === 'web') {
    const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    return expenses.filter(e => e.date >= startDate && e.date <= endDate).map(normalizeExpense);
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    const rows = await database.getAllAsync<ExpenseRow>('SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date DESC', [startDate, endDate]);
    return rows.map(normalizeExpenseRow);
  } catch (error) {
    console.log('Error getting expenses by date range:', error);
    return [];
  }
}

export async function createExpense(expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>): Promise<Expense> {
  const now = new Date().toISOString();
  const newExpense: Expense = {
    ...expense,
    name: expense.name ?? '',
    items: Array.isArray(expense.items) ? expense.items : [],
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  };

  if (Platform.OS === 'web') {
    const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    expenses.push(newExpense);
    await setToStorage(STORAGE_KEYS.expenses, expenses);
    await enqueueOutboxUpsert('expense', newExpense.id, {
      name: newExpense.name,
      amount: newExpense.total,
      date: newExpense.date,
    });
    return newExpense;
  }

  const database = await ensureDb();
  if (!database) throw new Error('Database not initialized');
  await database.runAsync(
    'INSERT INTO expenses (id, name, items, total, date, createdBy, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [newExpense.id, newExpense.name, serializeItems(newExpense.items), newExpense.total, newExpense.date, newExpense.createdBy, now, now, 'pending']
  );
  await enqueueOutboxUpsert('expense', newExpense.id, {
    name: newExpense.name,
    amount: newExpense.total,
    date: newExpense.date,
  });
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

export async function getOutboxItems(): Promise<OutboxItem[]> {
  if (Platform.OS === 'web') {
    const outbox = await getFromStorage<OutboxItem[]>(STORAGE_KEYS.outbox, []);
    return outbox.map(normalizeOutboxRow);
  }
  const database = await ensureDb();
  if (!database) return [];
  try {
    const rows = await database.getAllAsync<OutboxRow>('SELECT * FROM outbox ORDER BY createdAt DESC');
    return rows.map(normalizeOutboxRow);
  } catch (error) {
    console.log('Error getting outbox items:', error);
    return [];
  }
}

export async function enqueueDeletion(
  entityType: OutboxEntityType,
  entityId: string,
  metadata?: { name?: string; amount?: number | null; date?: string | null },
  options?: { isSyncing?: boolean }
): Promise<OutboxItem | null> {
  const now = new Date().toISOString();
  const isSyncing = options?.isSyncing ?? false;

  if (Platform.OS === 'web') {
    const outbox = await getFromStorage<OutboxItem[]>(STORAGE_KEYS.outbox, []);
    const upsertIndex = outbox.findIndex(item => item.entityType === entityType && item.entityId === entityId && item.operation === 'upsert');
    if (upsertIndex >= 0) {
      const existingUpsert = normalizeOutboxRow(outbox[upsertIndex]);
      if (existingUpsert.syncStatus === 'pending' && !isSyncing) {
        outbox.splice(upsertIndex, 1);
        await setToStorage(STORAGE_KEYS.outbox, outbox);
        return null;
      }
      if (existingUpsert.syncStatus !== 'in_progress' && !isSyncing) {
        outbox.splice(upsertIndex, 1);
      }
    }

    const existing = outbox.find(item => item.entityType === entityType && item.entityId === entityId && item.operation === 'delete');
    if (existing) {
      await setToStorage(STORAGE_KEYS.outbox, outbox);
      return normalizeOutboxRow(existing);
    }
    const newItem: OutboxItem = {
      id: generateId(),
      entityType,
      entityId,
      operation: 'delete',
      createdAt: now,
      syncStatus: 'pending',
      name: metadata?.name ?? null,
      amount: metadata?.amount ?? null,
      date: metadata?.date ?? null,
    };
    outbox.unshift(newItem);
    await setToStorage(STORAGE_KEYS.outbox, outbox);
    return newItem;
  }

  const database = await ensureDb();
  if (!database) return null;
  try {
    const existingUpsert = await database.getFirstAsync<OutboxRow>(
      'SELECT * FROM outbox WHERE entityType = ? AND entityId = ? AND operation = ? LIMIT 1',
      [entityType, entityId, 'upsert']
    );
    if (existingUpsert) {
      const normalizedUpsert = normalizeOutboxRow(existingUpsert);
      if (normalizedUpsert.syncStatus === 'pending' && !isSyncing) {
        await database.runAsync('DELETE FROM outbox WHERE id = ?', [normalizedUpsert.id]);
        return null;
      }
      if (normalizedUpsert.syncStatus !== 'in_progress' && !isSyncing) {
        await database.runAsync('DELETE FROM outbox WHERE id = ?', [normalizedUpsert.id]);
      }
    }

    const existing = await database.getFirstAsync<OutboxRow>(
      'SELECT * FROM outbox WHERE entityType = ? AND entityId = ? AND operation = ? LIMIT 1',
      [entityType, entityId, 'delete']
    );
    if (existing) {
      return normalizeOutboxRow(existing);
    }
    const id = generateId();
    await database.runAsync(
      'INSERT INTO outbox (id, entityType, entityId, operation, createdAt, syncStatus, name, amount, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        entityType,
        entityId,
        'delete',
        now,
        'pending',
        metadata?.name ?? null,
        metadata?.amount ?? null,
        metadata?.date ?? null,
      ]
    );
    return {
      id,
      entityType,
      entityId,
      operation: 'delete',
      createdAt: now,
      syncStatus: 'pending',
      name: metadata?.name ?? null,
      amount: metadata?.amount ?? null,
      date: metadata?.date ?? null,
    };
  } catch (error) {
    console.log('Error enqueueing deletion:', error);
    return null;
  }
}

export async function updateOutboxItemStatus(id: string, status: OutboxStatus): Promise<void> {
  if (Platform.OS === 'web') {
    const outbox = await getFromStorage<OutboxItem[]>(STORAGE_KEYS.outbox, []);
    const index = outbox.findIndex(item => item.id === id);
    if (index >= 0) {
      outbox[index] = { ...outbox[index], syncStatus: status };
      await setToStorage(STORAGE_KEYS.outbox, outbox);
    }
    return;
  }
  const database = await ensureDb();
  if (!database) return;
  await database.runAsync('UPDATE outbox SET syncStatus = ? WHERE id = ?', [status, id]);
}

export async function removeOutboxItem(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    const outbox = await getFromStorage<OutboxItem[]>(STORAGE_KEYS.outbox, []);
    await setToStorage(STORAGE_KEYS.outbox, outbox.filter(item => item.id !== id));
    return;
  }
  const database = await ensureDb();
  if (!database) return;
  await database.runAsync('DELETE FROM outbox WHERE id = ?', [id]);
}

export async function getPendingSyncCount(): Promise<number> {
  if (Platform.OS === 'web') {
    const users = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
    const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    const activities = await getFromStorage<Activity[]>(STORAGE_KEYS.activities, []);
    const chatMessages = await getFromStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, []);
    const outbox = await getFromStorage<OutboxItem[]>(STORAGE_KEYS.outbox, []);
    const deletionOutbox = outbox.filter(item => item.operation === 'delete');
    
    return [
      ...users.filter(u => u.syncStatus === 'pending'),
      ...sales.filter(s => s.syncStatus === 'pending'),
      ...expenses.filter(e => e.syncStatus === 'pending'),
      ...activities.filter(a => a.syncStatus === 'pending'),
      ...chatMessages.filter(message => message.syncStatus === 'pending'),
      ...deletionOutbox,
    ].length;
  }

  if (!db) return 0;
  
  const counts = await Promise.all([
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM users WHERE syncStatus = ?', ['pending']),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM sales WHERE syncStatus = ?', ['pending']),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM expenses WHERE syncStatus = ?', ['pending']),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM activities WHERE syncStatus = ?', ['pending']),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM chat_messages WHERE syncStatus = ?', ['pending']),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM outbox WHERE operation = ?', ['delete']),
  ]);

  return counts.reduce((sum, result) => sum + (result?.count || 0), 0);
}

type SyncableEntityTable = 'users' | 'sales' | 'expenses' | 'activities' | 'chat_messages';

async function markRecordsSynced(table: SyncableEntityTable, ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  if (Platform.OS === 'web') {
    const idSet = new Set(ids);
    const updateList = async <T extends { id: string; syncStatus: 'synced' | 'pending' }>(
      key: string
    ) => {
      const items = await getFromStorage<T[]>(key, []);
      await setToStorage(
        key,
        items.map(item => (idSet.has(item.id) ? { ...item, syncStatus: 'synced' as const } : item))
      );
    };

    if (table === 'users') {
      await updateList<User>(STORAGE_KEYS.users);
    } else if (table === 'sales') {
      await updateList<Sale>(STORAGE_KEYS.sales);
    } else if (table === 'expenses') {
      await updateList<Expense>(STORAGE_KEYS.expenses);
    } else if (table === 'activities') {
      await updateList<Activity>(STORAGE_KEYS.activities);
    } else if (table === 'chat_messages') {
      await updateList<ChatMessage>(STORAGE_KEYS.chatMessages);
    }
    return;
  }

  if (!db) return;
  const placeholders = ids.map(() => '?').join(', ');
  await db.runAsync(
    `UPDATE ${table} SET syncStatus = 'synced' WHERE id IN (${placeholders})`,
    ids
  );
}

export async function markUsersSynced(ids: string[]): Promise<void> {
  await markRecordsSynced('users', ids);
}

export async function markSalesSynced(ids: string[]): Promise<void> {
  await markRecordsSynced('sales', ids);
}

export async function markExpensesSynced(ids: string[]): Promise<void> {
  await markRecordsSynced('expenses', ids);
}

export async function markActivitiesSynced(ids: string[]): Promise<void> {
  await markRecordsSynced('activities', ids);
}

export async function markChatMessagesSynced(ids: string[]): Promise<void> {
  await markRecordsSynced('chat_messages', ids);
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
        localMap.set(serverUser.id, {
          ...serverUser,
          bio: serverUser.bio ?? local.bio,
          profilePicture: serverUser.profilePicture ?? local.profilePicture,
          syncStatus: 'synced',
        });
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
        [
          serverUser.name,
          serverUser.pin,
          serverUser.role,
          serverUser.bio ?? existing.bio ?? null,
          serverUser.profilePicture ?? existing.profilePicture ?? null,
          serverUser.createdAt,
          serverUser.updatedAt,
          'synced',
          serverUser.id,
        ]
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
      const normalizedSale = normalizeSale(serverSale);
      const local = localMap.get(serverSale.id);
      if (!local) {
        localMap.set(serverSale.id, { ...normalizedSale, syncStatus: 'synced' });
      } else if (local.syncStatus !== 'pending') {
        localMap.set(serverSale.id, { ...normalizedSale, syncStatus: 'synced' });
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
        'INSERT INTO sales (id, name, items, total, date, createdBy, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [serverSale.id, serverSale.name, serializeItems(serverSale.items), serverSale.total, serverSale.date, serverSale.createdBy, serverSale.createdAt, serverSale.updatedAt, 'synced']
      );
    } else if (existing.syncStatus !== 'pending') {
      await db.runAsync(
        'UPDATE sales SET name = ?, items = ?, total = ?, date = ?, createdBy = ?, createdAt = ?, updatedAt = ?, syncStatus = ? WHERE id = ?',
        [serverSale.name, serializeItems(serverSale.items), serverSale.total, serverSale.date, serverSale.createdBy, serverSale.createdAt, serverSale.updatedAt, 'synced', serverSale.id]
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
      const normalizedExpense = normalizeExpense(serverExpense);
      const local = localMap.get(serverExpense.id);
      if (!local) {
        localMap.set(serverExpense.id, { ...normalizedExpense, syncStatus: 'synced' });
      } else if (local.syncStatus !== 'pending') {
        localMap.set(serverExpense.id, { ...normalizedExpense, syncStatus: 'synced' });
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
        'INSERT INTO expenses (id, name, items, total, date, createdBy, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [serverExpense.id, serverExpense.name, serializeItems(serverExpense.items), serverExpense.total, serverExpense.date, serverExpense.createdBy, serverExpense.createdAt, serverExpense.updatedAt, 'synced']
      );
    } else if (existing.syncStatus !== 'pending') {
      await db.runAsync(
        'UPDATE expenses SET name = ?, items = ?, total = ?, date = ?, createdBy = ?, createdAt = ?, updatedAt = ?, syncStatus = ? WHERE id = ?',
        [serverExpense.name, serializeItems(serverExpense.items), serverExpense.total, serverExpense.date, serverExpense.createdBy, serverExpense.createdAt, serverExpense.updatedAt, 'synced', serverExpense.id]
      );
    }
  }
}

export async function upsertChatMessagesFromServer(serverMessages: ChatMessage[]): Promise<void> {
  if (serverMessages.length === 0) return;
  console.log(`Upserting ${serverMessages.length} chat messages from server`);

  if (Platform.OS === 'web') {
    const localMessages = await getFromStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, []);
    const localMap = new Map(localMessages.map(message => [message.id, message]));

    for (const serverMessage of serverMessages) {
      const normalizedMessage = normalizeChatMessage(serverMessage);
      const local = localMap.get(serverMessage.id);
      if (!local) {
        localMap.set(serverMessage.id, { ...normalizedMessage, syncStatus: 'synced' });
      } else if (local.syncStatus !== 'pending') {
        localMap.set(serverMessage.id, {
          ...normalizedMessage,
          localAvatarUri: local.localAvatarUri ?? null,
          syncStatus: 'synced',
        });
      }
    }

    const sortedMessages = Array.from(localMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    await setToStorage(STORAGE_KEYS.chatMessages, sortedMessages);
    return;
  }

  if (!db) return;

  for (const serverMessage of serverMessages) {
    const normalizedMessage = normalizeChatMessage(serverMessage);
    const existing = await db.getFirstAsync<ChatMessage>('SELECT * FROM chat_messages WHERE id = ?', [normalizedMessage.id]);
    if (!existing) {
      await db.runAsync(
        'INSERT INTO chat_messages (id, userId, userName, userAvatarUrl, localAvatarUri, messageText, createdAt, updatedAt, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          normalizedMessage.id,
          normalizedMessage.userId,
          normalizedMessage.userName,
          normalizedMessage.userAvatarUrl ?? null,
          normalizedMessage.localAvatarUri ?? null,
          normalizedMessage.messageText,
          normalizedMessage.createdAt,
          normalizedMessage.updatedAt,
          'synced',
        ]
      );
    } else if (existing.syncStatus !== 'pending') {
      await db.runAsync(
        'UPDATE chat_messages SET userId = ?, userName = ?, userAvatarUrl = ?, localAvatarUri = ?, messageText = ?, createdAt = ?, updatedAt = ?, syncStatus = ? WHERE id = ?',
        [
          normalizedMessage.userId,
          normalizedMessage.userName,
          normalizedMessage.userAvatarUrl ?? null,
          existing.localAvatarUri ?? normalizedMessage.localAvatarUri ?? null,
          normalizedMessage.messageText,
          normalizedMessage.createdAt,
          normalizedMessage.updatedAt,
          'synced',
          normalizedMessage.id,
        ]
      );
    }
  }
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
    let sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    let expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    let activities = await getFromStorage<Activity[]>(STORAGE_KEYS.activities, []);
    let chatMessages = await getFromStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, []);

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

    chatMessages = chatMessages.map(message => {
      if (message.userId && idRemapping.has(message.userId)) {
        return { ...message, userId: idRemapping.get(message.userId)! };
      }
      if (message.userId && !localUserIds.has(message.userId) && !validServerIds.has(message.userId) && fallbackServerId) {
        console.log(`Fixing orphan chat message ${message.id}: ${message.userId} -> ${fallbackServerId}`);
        orphanFixCount++;
        return { ...message, userId: fallbackServerId };
      }
      return message;
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
          role: (serverUser.role as User['role']) || matchedLocal?.role || 'general_manager',
          bio: matchedLocal?.bio,
          profilePicture: matchedLocal?.profilePicture,
          createdAt: matchedLocal?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          syncStatus: 'synced',
        });
      }
    }

    await setToStorage(STORAGE_KEYS.users, updatedUsers);
    await setToStorage(STORAGE_KEYS.sales, sales);
    await setToStorage(STORAGE_KEYS.expenses, expenses);
    await setToStorage(STORAGE_KEYS.activities, activities);
    await setToStorage(STORAGE_KEYS.chatMessages, chatMessages);

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
    await db.runAsync('UPDATE sales SET createdBy = ? WHERE createdBy = ?', [serverId, localId]);
    await db.runAsync('UPDATE expenses SET createdBy = ? WHERE createdBy = ?', [serverId, localId]);
    await db.runAsync('UPDATE activities SET userId = ? WHERE userId = ?', [serverId, localId]);
    await db.runAsync('UPDATE chat_messages SET userId = ? WHERE userId = ?', [serverId, localId]);
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
          serverUser.role || matchedLocal?.role || 'general_manager',
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

    const orphanedChatMessages = await db.getAllAsync<{ id: string; userId: string }>(
      `SELECT id, userId FROM chat_messages WHERE userId NOT IN (SELECT id FROM users)`
    );
    for (const message of orphanedChatMessages) {
      console.log(`Fixing orphan chat message ${message.id}: ${message.userId} -> ${fallbackServerId}`);
      await db.runAsync('UPDATE chat_messages SET userId = ? WHERE id = ?', [fallbackServerId, message.id]);
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
    let sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    let expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    let activities = await getFromStorage<Activity[]>(STORAGE_KEYS.activities, []);
    let chatMessages = await getFromStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, []);

    sales = sales.map(s =>
      s.createdBy === localUserId ? { ...s, createdBy: serverUserId } : s
    );
    expenses = expenses.map(e =>
      e.createdBy === localUserId ? { ...e, createdBy: serverUserId } : e
    );
    activities = activities.map(a =>
      a.userId === localUserId ? { ...a, userId: serverUserId } : a
    );
    chatMessages = chatMessages.map(message =>
      message.userId === localUserId ? { ...message, userId: serverUserId } : message
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
    await setToStorage(STORAGE_KEYS.sales, sales);
    await setToStorage(STORAGE_KEYS.expenses, expenses);
    await setToStorage(STORAGE_KEYS.activities, activities);
    await setToStorage(STORAGE_KEYS.chatMessages, chatMessages);
    return;
  }

  if (!db) return;

  await db.runAsync('UPDATE sales SET createdBy = ? WHERE createdBy = ?', [serverUserId, localUserId]);
  await db.runAsync('UPDATE expenses SET createdBy = ? WHERE createdBy = ?', [serverUserId, localUserId]);
  await db.runAsync('UPDATE activities SET userId = ? WHERE userId = ?', [serverUserId, localUserId]);
  await db.runAsync('UPDATE chat_messages SET userId = ? WHERE userId = ?', [serverUserId, localUserId]);

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
  fixedActivities: number;
  fixedChatMessages: number;
}

export async function repairOrphanAuthors(fallbackUserId: string): Promise<OrphanRepairResult> {
  console.log(`Repairing orphan authors with fallback user: ${fallbackUserId}`);
  const result: OrphanRepairResult = {
    fixedSales: 0,
    fixedExpenses: 0,
    fixedActivities: 0,
    fixedChatMessages: 0,
  };

  if (Platform.OS === 'web') {
    const users = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
    const validUserIds = new Set(users.map(u => u.id));

    if (!validUserIds.has(fallbackUserId)) {
      console.log('Fallback user not found in local users, cannot repair orphans');
      return result;
    }

    let sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    let expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    let activities = await getFromStorage<Activity[]>(STORAGE_KEYS.activities, []);
    let chatMessages = await getFromStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, []);

    const now = new Date().toISOString();

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

    chatMessages = chatMessages.map(message => {
      if (message.syncStatus === 'pending' && message.userId && !validUserIds.has(message.userId)) {
        console.log(`Fixing orphan chat message ${message.id}: ${message.userId} -> ${fallbackUserId}`);
        result.fixedChatMessages++;
        return { ...message, userId: fallbackUserId, updatedAt: now };
      }
      return message;
    });

    await setToStorage(STORAGE_KEYS.sales, sales);
    await setToStorage(STORAGE_KEYS.expenses, expenses);
    await setToStorage(STORAGE_KEYS.activities, activities);
    await setToStorage(STORAGE_KEYS.chatMessages, chatMessages);

    console.log(`Orphan repair complete (web): ${result.fixedSales} sales, ${result.fixedExpenses} expenses, ${result.fixedActivities} activities, ${result.fixedChatMessages} chat messages`);
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

  const orphanedChatMessages = await db.getAllAsync<{ id: string; userId: string }>(
    `SELECT id, userId FROM chat_messages WHERE syncStatus = 'pending' AND userId NOT IN (SELECT id FROM users)`
  );
  for (const message of orphanedChatMessages) {
    console.log(`Fixing orphan chat message ${message.id}: ${message.userId} -> ${fallbackUserId}`);
    await db.runAsync('UPDATE chat_messages SET userId = ?, updatedAt = ? WHERE id = ?', [fallbackUserId, now, message.id]);
    result.fixedChatMessages++;
  }

  console.log(`Orphan repair complete: ${result.fixedSales} sales, ${result.fixedExpenses} expenses, ${result.fixedActivities} activities, ${result.fixedChatMessages} chat messages`);
  return result;
}

export interface PendingSummary {
  totals: {
    users: number;
    chatMessages: number;
    sales: number;
    expenses: number;
    activities: number;
    deletions: number;
    total: number;
  };
  itemsByTable: {
    users: { id: string; pin: string; name: string; role: string; syncStatus: string; updatedAt: string }[];
    chatMessages: { id: string; userId: string; userName: string; messageText: string; syncStatus: string; updatedAt: string }[];
    sales: { id: string; name: string; total: number; createdBy: string; date: string; syncStatus: string; updatedAt: string }[];
    expenses: { id: string; name: string; total: number; createdBy: string; date: string; syncStatus: string; updatedAt: string }[];
    activities: { id: string; type: string; description: string; userId: string; syncStatus: string; createdAt: string }[];
    deletions: OutboxItem[];
  };
}

export async function getPendingSummaryAndItems(limitPerTable = 50): Promise<PendingSummary> {
  const result: PendingSummary = {
    totals: { users: 0, chatMessages: 0, sales: 0, expenses: 0, activities: 0, deletions: 0, total: 0 },
    itemsByTable: { users: [], chatMessages: [], sales: [], expenses: [], activities: [], deletions: [] },
  };

  try {
    if (Platform.OS === 'web') {
      const users = await getFromStorage<User[]>(STORAGE_KEYS.users, []);
      const chatMessages = await getFromStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, []);
      const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
      const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
      const activities = await getFromStorage<Activity[]>(STORAGE_KEYS.activities, []);
      const outbox = await getFromStorage<OutboxItem[]>(STORAGE_KEYS.outbox, []);

      const pendingUsers = users.filter(u => u.syncStatus === 'pending');
      const pendingChatMessages = chatMessages.filter(message => message.syncStatus === 'pending');
      const pendingSales = sales.filter(s => s.syncStatus === 'pending');
      const pendingExpenses = expenses.filter(e => e.syncStatus === 'pending');
      const pendingActivities = activities.filter(a => a.syncStatus === 'pending');
      const pendingDeletions = outbox.filter(item => item.operation === 'delete').map(normalizeOutboxRow);

      result.totals.users = pendingUsers.length;
      result.totals.chatMessages = pendingChatMessages.length;
      result.totals.sales = pendingSales.length;
      result.totals.expenses = pendingExpenses.length;
      result.totals.activities = pendingActivities.length;
      result.totals.deletions = pendingDeletions.length;
      result.totals.total = pendingUsers.length + pendingChatMessages.length + pendingSales.length + pendingExpenses.length + pendingActivities.length + pendingDeletions.length;

      result.itemsByTable.users = pendingUsers.slice(0, limitPerTable).map(u => ({
        id: u.id, pin: u.pin, name: u.name, role: u.role, syncStatus: u.syncStatus || 'pending', updatedAt: u.updatedAt,
      }));
      result.itemsByTable.chatMessages = pendingChatMessages.slice(0, limitPerTable).map(message => ({
        id: message.id,
        userId: message.userId,
        userName: message.userName,
        messageText: message.messageText,
        syncStatus: message.syncStatus || 'pending',
        updatedAt: message.updatedAt,
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
      result.itemsByTable.deletions = pendingDeletions.slice(0, limitPerTable);

      return result;
    }

    if (!db) return result;

    const [usersCount, chatMessagesCount, salesCount, expensesCount, activitiesCount, deletionsCount] = await Promise.all([
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM users WHERE syncStatus = ?', ['pending']),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM chat_messages WHERE syncStatus = ?', ['pending']),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM sales WHERE syncStatus = ?', ['pending']),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM expenses WHERE syncStatus = ?', ['pending']),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM activities WHERE syncStatus = ?', ['pending']),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM outbox WHERE operation = ?', ['delete']),
    ]);

    result.totals.users = usersCount?.count || 0;
    result.totals.chatMessages = chatMessagesCount?.count || 0;
    result.totals.sales = salesCount?.count || 0;
    result.totals.expenses = expensesCount?.count || 0;
    result.totals.activities = activitiesCount?.count || 0;
    result.totals.deletions = deletionsCount?.count || 0;
    result.totals.total = result.totals.users + result.totals.chatMessages + result.totals.sales + result.totals.expenses + result.totals.activities + result.totals.deletions;

    const [pendingUsers, pendingChatMessages, pendingSales, pendingExpenses, pendingActivities, pendingDeletions] = await Promise.all([
      db.getAllAsync<User>(`SELECT * FROM users WHERE syncStatus = 'pending' LIMIT ?`, [limitPerTable]),
      db.getAllAsync<ChatMessageRow>(`SELECT * FROM chat_messages WHERE syncStatus = 'pending' LIMIT ?`, [limitPerTable]),
      db.getAllAsync<Sale>(`SELECT * FROM sales WHERE syncStatus = 'pending' LIMIT ?`, [limitPerTable]),
      db.getAllAsync<Expense>(`SELECT * FROM expenses WHERE syncStatus = 'pending' LIMIT ?`, [limitPerTable]),
      db.getAllAsync<Activity>(`SELECT * FROM activities WHERE syncStatus = 'pending' LIMIT ?`, [limitPerTable]),
      db.getAllAsync<OutboxRow>(`SELECT * FROM outbox WHERE operation = 'delete' ORDER BY createdAt DESC LIMIT ?`, [limitPerTable]),
    ]);

    result.itemsByTable.users = pendingUsers.map(u => ({
      id: u.id, pin: u.pin, name: u.name, role: u.role, syncStatus: u.syncStatus || 'pending', updatedAt: u.updatedAt,
    }));
    result.itemsByTable.chatMessages = pendingChatMessages.map(message => ({
      id: message.id,
      userId: message.userId,
      userName: message.userName,
      messageText: message.messageText,
      syncStatus: message.syncStatus || 'pending',
      updatedAt: message.updatedAt,
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
    result.itemsByTable.deletions = pendingDeletions.map(normalizeOutboxRow);

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

export async function getWeeklySalesTotals(startDate: string, endDate: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const start = parseLocalDateString(startDate);
  const dayKeys = getDayKeysForWeek(start);
  const dayKeysSet = new Set(dayKeys);
  
  if (Platform.OS === 'web') {
    const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    const totals = bucketByLocalDay(sales, dayKeysSet);
    for (const key of dayKeys) {
      result[key] = totals.get(key) || 0;
    }
    console.log(`Web weekly sales totals (${startDate} to ${endDate}):`, result);
    return result;
  }
  
  const database = await ensureDb();
  if (!database) return result;
  
  try {
    const rows = await database.getAllAsync<{ date: string; total: number }>(
      `SELECT date, total FROM sales`
    );
    for (const row of rows) {
      const key = toLocalDayKey(row.date);
      if (!dayKeysSet.has(key)) continue;
      result[key] = (result[key] || 0) + Number(row.total || 0);
    }
    for (const key of dayKeys) {
      result[key] = result[key] || 0;
    }
  } catch (error) {
    console.log('Error getting weekly sales totals:', error);
  }
  
  return result;
}

export async function getMonthlyTotalsForYear(year: number): Promise<{
  monthIndex: number;
  sales: number;
  expenses: number;
}[]> {
  const base = Array.from({ length: 12 }, (_, monthIndex) => ({
    monthIndex,
    sales: 0,
    expenses: 0,
  }));
  const totalsByMonth = new Map<number, { sales: number; expenses: number }>();

  const ensureEntry = (monthIndex: number) => {
    const current = totalsByMonth.get(monthIndex);
    if (current) return current;
    const created = { sales: 0, expenses: 0 };
    totalsByMonth.set(monthIndex, created);
    return created;
  };

  const applyTotal = (ym: string, value: unknown, field: 'sales' | 'expenses') => {
    if (typeof ym !== 'string' || !/^\d{4}-\d{2}$/.test(ym)) return;
    const [yearPart, monthPart] = ym.split('-');
    if (Number(yearPart) !== year) return;
    const monthIndex = Number(monthPart) - 1;
    if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return;
    const parsedTotal = Number(value);
    const safeTotal = Number.isFinite(parsedTotal) ? parsedTotal : 0;
    const entry = ensureEntry(monthIndex);
    entry[field] += safeTotal;
  };

  if (Platform.OS === 'web') {
    const sales = await getFromStorage<Sale[]>(STORAGE_KEYS.sales, []);
    const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);

    for (const sale of sales) {
      if (!sale.date) continue;
      applyTotal(sale.date.slice(0, 7), sale.total, 'sales');
    }

    for (const expense of expenses) {
      if (!expense.date) continue;
      applyTotal(expense.date.slice(0, 7), expense.total, 'expenses');
    }

    return base.map(item => {
      const monthTotals = totalsByMonth.get(item.monthIndex);
      return {
        ...item,
        sales: monthTotals?.sales ?? 0,
        expenses: monthTotals?.expenses ?? 0,
      };
    });
  }

  const database = await ensureDb();
  if (!database) return base;

  try {
    const salesRows = await database.getAllAsync<{ ym: string; total: number | null }>(
      `SELECT substr(date,1,7) as ym, SUM(total) as total
       FROM sales
       WHERE substr(date,1,4) = ?
       GROUP BY ym;`,
      [String(year)]
    );
    for (const row of salesRows) {
      applyTotal(row.ym, row.total, 'sales');
    }

    const expenseRows = await database.getAllAsync<{ ym: string; total: number | null }>(
      `SELECT substr(date,1,7) as ym, SUM(total) as total
       FROM expenses
       WHERE substr(date,1,4) = ?
       GROUP BY ym;`,
      [String(year)]
    );
    for (const row of expenseRows) {
      applyTotal(row.ym, row.total, 'expenses');
    }
  } catch (error) {
    console.log('Error getting monthly totals for year:', error);
  }

  return base.map(item => {
    const monthTotals = totalsByMonth.get(item.monthIndex);
    return {
      ...item,
      sales: monthTotals?.sales ?? 0,
      expenses: monthTotals?.expenses ?? 0,
    };
  });
}

export async function getWeeklyExpenseTotals(startDate: string, endDate: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const start = parseLocalDateString(startDate);
  const dayKeys = getDayKeysForWeek(start);
  const dayKeysSet = new Set(dayKeys);
  
  if (Platform.OS === 'web') {
    const expenses = await getFromStorage<Expense[]>(STORAGE_KEYS.expenses, []);
    const totals = bucketByLocalDay(expenses, dayKeysSet);
    for (const key of dayKeys) {
      result[key] = totals.get(key) || 0;
    }
    console.log(`Web weekly expense totals (${startDate} to ${endDate}):`, result);
    return result;
  }
  
  const database = await ensureDb();
  if (!database) return result;
  
  try {
    const rows = await database.getAllAsync<{ date: string; total: number }>(
      `SELECT date, total FROM expenses`
    );
    for (const row of rows) {
      const key = toLocalDayKey(row.date);
      if (!dayKeysSet.has(key)) continue;
      result[key] = (result[key] || 0) + Number(row.total || 0);
    }
    for (const key of dayKeys) {
      result[key] = result[key] || 0;
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
