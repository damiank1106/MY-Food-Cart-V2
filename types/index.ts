export type UserRole = 'general_manager' | 'operation_manager' | 'inventory_clerk' | 'developer';

export interface User {
  id: string;
  name: string;
  pin: string;
  role: UserRole;
  bio?: string;
  profilePicture?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending';
}

export interface Category {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending';
}

export type UnitType = 'pcs' | 'kg' | 'g' | 'L' | 'mL' | 'bundle' | 'pack';

export interface InventoryItem {
  id: string;
  name: string;
  categoryId: string | null;
  unit: UnitType;
  price: number;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  syncStatus: 'synced' | 'pending';
}

export interface Sale {
  id: string;
  name: string;
  items?: string[] | null;
  total: number;
  date: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending';
}

export interface Expense {
  id: string;
  name: string;
  items?: string[] | null;
  total: number;
  date: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending';
}

export type ActivityType = 'inventory_add' | 'inventory_update' | 'inventory_delete' | 'sale_add' | 'expense_add' | 'profile_update' | 'settings_change';

export interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  userId: string;
  createdAt: string;
  syncStatus: 'synced' | 'pending';
}

export type BackgroundColorPalette = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan';

export type BackgroundIntensity = 'low' | 'medium' | 'high';

export interface AppSettings {
  darkMode: boolean;
  hasSeenIntro: boolean;
  laserBackground: boolean;
  backgroundColorPalette: BackgroundColorPalette;
  backgroundIntensity: BackgroundIntensity;
}

export const DEFAULT_CATEGORIES: string[] = ['Cart', 'Freezer', 'Condiments', 'Packing Supply'];

export const UNITS: UnitType[] = ['pcs', 'kg', 'g', 'L', 'mL', 'bundle', 'pack'];

export const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  general_manager: 'General Manager',
  operation_manager: 'Operation Manager',
  inventory_clerk: 'Inventory Clerk',
  developer: 'Developer',
};

export const DEFAULT_USERS: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>[] = [
  { name: 'General Manager', pin: '1234', role: 'general_manager' },
  { name: 'Operation Manager', pin: '1111', role: 'operation_manager' },
  { name: 'Inventory Clerk', pin: '2222', role: 'inventory_clerk' },
  { name: 'Developer', pin: '2345', role: 'developer' },
];

export function formatCurrency(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

export function formatShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
