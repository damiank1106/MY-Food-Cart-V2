import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, AppSettings } from '@/types';
import { initDatabase, getUserByPin, updateUser, isPinTaken, createActivity } from '@/services/database';

const SETTINGS_KEY = '@myfoodcart_settings';
const CURRENT_USER_KEY = '@myfoodcart_current_user';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    darkMode: true,
    hasSeenIntro: false,
    laserBackground: true,
    backgroundColorPalette: 'blue',
  });

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    console.log('Initializing app...');
    try {
      await initDatabase();
      
      const savedSettings = await AsyncStorage.getItem(SETTINGS_KEY);
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }

      const savedUser = await AsyncStorage.getItem(CURRENT_USER_KEY);
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        const freshUser = await getUserByPin(parsed.pin);
        if (freshUser) {
          setUser(freshUser);
        }
      }
      
      setIsInitialized(true);
    } catch (error) {
      console.log('Error initializing app:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = useCallback(async (pin: string): Promise<{ success: boolean; error?: string }> => {
    console.log('Attempting login with PIN...');
    try {
      const foundUser = await getUserByPin(pin);
      if (foundUser) {
        setUser(foundUser);
        await AsyncStorage.setItem(CURRENT_USER_KEY, JSON.stringify(foundUser));
        console.log('Login successful for:', foundUser.name);
        return { success: true };
      }
      console.log('Invalid PIN');
      return { success: false, error: 'Invalid PIN' };
    } catch (error) {
      console.log('Login error:', error);
      return { success: false, error: 'Login failed' };
    }
  }, []);

  const logout = useCallback(async () => {
    console.log('Logging out...');
    setUser(null);
    await AsyncStorage.removeItem(CURRENT_USER_KEY);
  }, []);

  const updateCurrentUser = useCallback(async (updates: Partial<User>) => {
    if (!user) return;
    
    const updatedUser = { ...user, ...updates };
    await updateUser(updatedUser);
    setUser(updatedUser);
    await AsyncStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
    
    await createActivity({
      type: 'profile_update',
      description: 'Profile updated',
      userId: user.id,
    });
  }, [user]);

  const changePin = useCallback(async (newPin: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not logged in' };
    
    if (newPin.length < 4 || newPin.length > 12 || !/^\d+$/.test(newPin)) {
      return { success: false, error: 'PIN must be 4-12 digits' };
    }
    
    const taken = await isPinTaken(newPin, user.id);
    if (taken) {
      return { success: false, error: 'PIN is already taken. Please choose another one.' };
    }
    
    const updatedUser = { ...user, pin: newPin };
    await updateUser(updatedUser);
    
    await createActivity({
      type: 'settings_change',
      description: 'PIN changed',
      userId: user.id,
    });
    
    await logout();
    return { success: true };
  }, [user, logout]);

  const updateSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    
    if (user) {
      await createActivity({
        type: 'settings_change',
        description: 'Settings changed',
        userId: user.id,
      });
    }
  }, [settings, user]);

  const markIntroSeen = useCallback(async () => {
    await updateSettings({ hasSeenIntro: true });
  }, [updateSettings]);

  const refreshUser = useCallback(async () => {
    if (!user) return;
    const freshUser = await getUserByPin(user.pin);
    if (freshUser) {
      setUser(freshUser);
      await AsyncStorage.setItem(CURRENT_USER_KEY, JSON.stringify(freshUser));
    }
  }, [user]);

  return {
    user,
    isLoading,
    isInitialized,
    settings,
    login,
    logout,
    updateCurrentUser,
    changePin,
    updateSettings,
    markIntroSeen,
    refreshUser,
  };
});
