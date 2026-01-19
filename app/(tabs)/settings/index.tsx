import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Switch,
  Alert,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock, Moon, HelpCircle, Info, LogOut, Eye, EyeOff, X, UserPlus, ChevronDown, ChevronRight, RefreshCw, Cloud, CloudOff, Database, AlertTriangle, Wrench } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';
import { UserRole, ROLE_DISPLAY_NAMES } from '@/types';
import { createUser, isPinTaken, getPendingSummaryAndItems, PendingSummary } from '@/services/database';
import { useSync } from '@/contexts/SyncContext';
import { supabase, isSupabaseConfigured } from '@/services/supabase';
import SyncProgressModal from '@/components/SyncProgressModal';

const APP_VERSION = '1.0.0';
const PRIVACY_POLICY_GITHUB_URL = 'https://github.com/user/myfoodcart-privacy-policy';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, settings, updateSettings, changePin, logout } = useAuth();
  const { syncStatus, pendingCount, isOnline, triggerSync, syncBeforeLogout } = useSync();
  const queryClient = useQueryClient();
  const theme = settings.darkMode ? Colors.dark : Colors.light;
  
  const [showPinModal, setShowPinModal] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [pinError, setPinError] = useState('');
  
  const [newUserName, setNewUserName] = useState('');
  const [newUserPin, setNewUserPin] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('inventory_clerk');
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [createUserError, setCreateUserError] = useState('');
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showConnectionTestModal, setShowConnectionTestModal] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<'connected' | 'not_connected' | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [pendingSummary, setPendingSummary] = useState<PendingSummary | null>(null);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [isFixingSyncing, setIsFixingSyncing] = useState(false);

  const isDeveloper = user?.role === 'developer';

  const loadPendingSummary = useCallback(async () => {
    if (!isDeveloper) return;
    setIsLoadingPending(true);
    try {
      const summary = await getPendingSummaryAndItems(50);
      setPendingSummary(summary);
      console.log('Pending summary loaded:', summary.totals);
    } catch (error) {
      console.log('Error loading pending summary:', error);
    } finally {
      setIsLoadingPending(false);
    }
  }, [isDeveloper]);

  useEffect(() => {
    if (isDeveloper) {
      loadPendingSummary();
    }
  }, [isDeveloper, loadPendingSummary, pendingCount]);

  const toggleTableExpanded = (table: string) => {
    setExpandedTables(prev => ({ ...prev, [table]: !prev[table] }));
  };

  const handleFixAndSync = async () => {
    setIsFixingSyncing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      console.log('Starting fix and sync...');
      await triggerSync();
      await loadPendingSummary();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.log('Fix and sync error:', error);
    } finally {
      setIsFixingSyncing(false);
    }
  };

  const truncateId = (id: string) => {
    if (id.length <= 16) return id;
    return `${id.substring(0, 8)}...${id.substring(id.length - 4)}`;
  };

  const createUserMutation = useMutation({
    mutationFn: async (data: { name: string; pin: string; role: UserRole }) => {
      const taken = await isPinTaken(data.pin);
      if (taken) {
        throw new Error('PIN is already taken. Please choose another one.');
      }
      return createUser(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setNewUserName('');
      setNewUserPin('');
      setNewUserRole('inventory_clerk');
      setShowCreateUserModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error: Error) => {
      setCreateUserError(error.message);
    },
  });

  const handleChangePin = async () => {
    setPinError('');
    
    if (!newPin || newPin.length < 4 || newPin.length > 12) {
      setPinError('PIN must be 4-12 digits');
      return;
    }
    
    if (!/^\d+$/.test(newPin)) {
      setPinError('PIN must contain only numbers');
      return;
    }
    
    if (newPin !== confirmPin) {
      setPinError('PINs do not match');
      return;
    }
    
    const result = await changePin(newPin);
    
    if (result.success) {
      setShowPinModal(false);
      setNewPin('');
      setConfirmPin('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/');
    } else {
      setPinError(result.error || 'Failed to change PIN');
      if (result.error?.includes('already taken')) {
        if (Platform.OS === 'web') {
          alert(result.error);
        } else {
          Alert.alert('Error', result.error);
        }
      }
    }
  };

  const handleCreateUser = async () => {
    setCreateUserError('');
    
    if (!newUserName.trim()) {
      setCreateUserError('Name is required');
      return;
    }
    
    if (!newUserPin || newUserPin.length < 4 || newUserPin.length > 12) {
      setCreateUserError('PIN must be 4-12 digits');
      return;
    }
    
    if (!/^\d+$/.test(newUserPin)) {
      setCreateUserError('PIN must contain only numbers');
      return;
    }
    
    createUserMutation.mutate({
      name: newUserName.trim(),
      pin: newUserPin,
      role: newUserRole,
    });
  };

  const handleDarkModeToggle = async (value: boolean) => {
    await updateSettings({ darkMode: value });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleLogout = async () => {
    setShowSyncModal(true);
    try {
      await syncBeforeLogout();
    } finally {
      setShowSyncModal(false);
    }
    await logout();
    await updateSettings({ hasSeenIntro: false });
    router.replace('/');
  };

  const handleGoToWelcome = async () => {
    setShowSyncModal(true);
    try {
      await syncBeforeLogout();
    } finally {
      setShowSyncModal(false);
    }
    await logout();
    await updateSettings({ hasSeenIntro: false });
    router.replace('/');
  };

  const handleManualSync = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await triggerSync();
  };

  const getSyncStatusDisplay = (): { text: string; color: string; icon: React.ReactNode } => {
    switch (syncStatus) {
      case 'synced':
        return { text: 'Synced', color: theme.success, icon: <Cloud color={theme.success} size={20} /> };
      case 'pending':
        return { text: `Pending (${pendingCount})`, color: theme.warning, icon: <Cloud color={theme.warning} size={20} /> };
      case 'syncing':
        return { text: 'Syncing...', color: theme.primary, icon: <RefreshCw color={theme.primary} size={20} /> };
      case 'offline':
        return { text: 'Offline', color: theme.textMuted, icon: <CloudOff color={theme.textMuted} size={20} /> };
      default:
        return { text: 'Unknown', color: theme.textMuted, icon: <Cloud color={theme.textMuted} size={20} /> };
    }
  };

  const syncStatusDisplay = getSyncStatusDisplay();

  const handlePrivacyPolicy = () => {
    setShowPrivacyModal(true);
  };

  const openGitHubPrivacyPolicy = () => {
    Linking.openURL(PRIVACY_POLICY_GITHUB_URL);
  };

  const roles: UserRole[] = ['general_manager', 'operation_manager', 'inventory_clerk', 'developer'];

  const handleSupabaseConnectionTest = async () => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    setShowConnectionTestModal(true);
    
    try {
      if (!isSupabaseConfigured() || !supabase) {
        console.log('Supabase not configured');
        setConnectionTestResult('not_connected');
        return;
      }
      
      const { error } = await supabase.from('users').select('id').limit(1);
      
      if (error) {
        console.log('Supabase connection test failed');
        setConnectionTestResult('not_connected');
      } else {
        console.log('Supabase connection test successful');
        setConnectionTestResult('connected');
      }
    } catch {
      console.log('Supabase connection test error');
      setConnectionTestResult('not_connected');
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={[theme.backgroundGradientStart, theme.backgroundGradientEnd]}
        style={StyleSheet.absoluteFill}
      />
      
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.divider }]}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Settings</Text>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Account</Text>
            
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => setShowPinModal(true)}
            >
              <View style={[styles.settingIcon, { backgroundColor: theme.primary + '20' }]}>
                <Lock color={theme.primary} size={20} />
              </View>
              <Text style={[styles.settingLabel, { color: theme.text }]}>Change PIN</Text>
            </TouchableOpacity>

            {isDeveloper && (
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => setShowCreateUserModal(true)}
              >
                <View style={[styles.settingIcon, { backgroundColor: theme.success + '20' }]}>
                  <UserPlus color={theme.success} size={20} />
                </View>
                <Text style={[styles.settingLabel, { color: theme.text }]}>Create New User</Text>
              </TouchableOpacity>
            )}

            {isDeveloper && (
              <TouchableOpacity
                style={styles.settingRow}
                onPress={handleSupabaseConnectionTest}
              >
                <View style={[styles.settingIcon, { backgroundColor: theme.primary + '20' }]}>
                  <Database color={theme.primary} size={20} />
                </View>
                <Text style={[styles.settingLabel, { color: theme.text }]}>Supabase Connection Test</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Preferences</Text>
            
            <View style={styles.settingRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.primary + '20' }]}>
                <Moon color={theme.primary} size={20} />
              </View>
              <Text style={[styles.settingLabel, { color: theme.text }]}>Dark Mode</Text>
              <Switch
                value={settings.darkMode}
                onValueChange={handleDarkModeToggle}
                trackColor={{ false: theme.inputBorder, true: theme.primary + '60' }}
                thumbColor={settings.darkMode ? theme.primary : theme.textMuted}
              />
            </View>
          </View>

          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Help & Legal</Text>
            
            <TouchableOpacity
              style={styles.settingRow}
              onPress={handlePrivacyPolicy}
            >
              <View style={[styles.settingIcon, { backgroundColor: theme.primary + '20' }]}>
                <HelpCircle color={theme.primary} size={20} />
              </View>
              <Text style={[styles.settingLabel, { color: theme.text }]}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Sync Status</Text>
            
            <View style={styles.settingRow}>
              <View style={[styles.settingIcon, { backgroundColor: syncStatusDisplay.color + '20' }]}>
                {syncStatusDisplay.icon}
              </View>
              <Text style={[styles.settingLabel, { color: theme.text }]}>Status</Text>
              <Text style={[styles.settingValue, { color: syncStatusDisplay.color }]}>{syncStatusDisplay.text}</Text>
            </View>

            <TouchableOpacity
              style={styles.settingRow}
              onPress={handleManualSync}
              disabled={syncStatus === 'syncing' || !isOnline}
            >
              <View style={[styles.settingIcon, { backgroundColor: theme.primary + '20' }]}>
                <RefreshCw color={theme.primary} size={20} />
              </View>
              <Text style={[styles.settingLabel, { color: theme.text }]}>Sync Now</Text>
            </TouchableOpacity>
          </View>

          {isDeveloper && (
            <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Pending Sync Items (Developer)</Text>
              
              {isLoadingPending ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={theme.primary} />
                  <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading...</Text>
                </View>
              ) : pendingSummary ? (
                <>
                  <View style={styles.pendingTotalRow}>
                    <AlertTriangle color={theme.warning} size={18} />
                    <Text style={[styles.pendingTotalText, { color: theme.text }]}>
                      Total Pending: {pendingSummary.totals.total}
                    </Text>
                  </View>

                  {pendingSummary.totals.users > 0 && (
                    <View style={styles.tableGroup}>
                      <TouchableOpacity
                        style={styles.tableHeader}
                        onPress={() => toggleTableExpanded('users')}
                      >
                        {expandedTables.users ? (
                          <ChevronDown color={theme.textMuted} size={16} />
                        ) : (
                          <ChevronRight color={theme.textMuted} size={16} />
                        )}
                        <Text style={[styles.tableTitle, { color: theme.text }]}>
                          Users ({pendingSummary.totals.users})
                        </Text>
                      </TouchableOpacity>
                      {expandedTables.users && pendingSummary.itemsByTable.users.map(item => (
                        <View key={item.id} style={[styles.pendingItem, { borderColor: theme.divider }]}>
                          <Text style={[styles.pendingItemName, { color: theme.text }]}>{item.name}</Text>
                          <Text style={[styles.pendingItemId, { color: theme.textMuted }]}>ID: {truncateId(item.id)}</Text>
                          <Text style={[styles.pendingItemMeta, { color: theme.textMuted }]}>PIN: {item.pin} | Role: {item.role}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {pendingSummary.totals.categories > 0 && (
                    <View style={styles.tableGroup}>
                      <TouchableOpacity
                        style={styles.tableHeader}
                        onPress={() => toggleTableExpanded('categories')}
                      >
                        {expandedTables.categories ? (
                          <ChevronDown color={theme.textMuted} size={16} />
                        ) : (
                          <ChevronRight color={theme.textMuted} size={16} />
                        )}
                        <Text style={[styles.tableTitle, { color: theme.text }]}>
                          Categories ({pendingSummary.totals.categories})
                        </Text>
                      </TouchableOpacity>
                      {expandedTables.categories && pendingSummary.itemsByTable.categories.map(item => (
                        <View key={item.id} style={[styles.pendingItem, { borderColor: theme.divider }]}>
                          <Text style={[styles.pendingItemName, { color: theme.text }]}>{item.name}</Text>
                          <Text style={[styles.pendingItemId, { color: theme.textMuted }]}>ID: {truncateId(item.id)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {pendingSummary.totals.inventory > 0 && (
                    <View style={styles.tableGroup}>
                      <TouchableOpacity
                        style={styles.tableHeader}
                        onPress={() => toggleTableExpanded('inventory')}
                      >
                        {expandedTables.inventory ? (
                          <ChevronDown color={theme.textMuted} size={16} />
                        ) : (
                          <ChevronRight color={theme.textMuted} size={16} />
                        )}
                        <Text style={[styles.tableTitle, { color: theme.text }]}>
                          Inventory ({pendingSummary.totals.inventory})
                        </Text>
                      </TouchableOpacity>
                      {expandedTables.inventory && pendingSummary.itemsByTable.inventory.map(item => (
                        <View key={item.id} style={[styles.pendingItem, { borderColor: theme.divider }]}>
                          <Text style={[styles.pendingItemName, { color: theme.text }]}>{item.name}</Text>
                          <Text style={[styles.pendingItemId, { color: theme.textMuted }]}>ID: {truncateId(item.id)}</Text>
                          <Text style={[styles.pendingItemMeta, { color: theme.warning }]}>created_by: {truncateId(item.createdBy)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {pendingSummary.totals.sales > 0 && (
                    <View style={styles.tableGroup}>
                      <TouchableOpacity
                        style={styles.tableHeader}
                        onPress={() => toggleTableExpanded('sales')}
                      >
                        {expandedTables.sales ? (
                          <ChevronDown color={theme.textMuted} size={16} />
                        ) : (
                          <ChevronRight color={theme.textMuted} size={16} />
                        )}
                        <Text style={[styles.tableTitle, { color: theme.text }]}>
                          Sales ({pendingSummary.totals.sales})
                        </Text>
                      </TouchableOpacity>
                      {expandedTables.sales && pendingSummary.itemsByTable.sales.map(item => (
                        <View key={item.id} style={[styles.pendingItem, { borderColor: theme.divider }]}>
                          <Text style={[styles.pendingItemName, { color: theme.text }]}>{item.name} - ₱{item.total.toFixed(2)}</Text>
                          <Text style={[styles.pendingItemId, { color: theme.textMuted }]}>ID: {truncateId(item.id)}</Text>
                          <Text style={[styles.pendingItemMeta, { color: theme.warning }]}>created_by: {truncateId(item.createdBy)}</Text>
                          <Text style={[styles.pendingItemMeta, { color: theme.textMuted }]}>Date: {item.date}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {pendingSummary.totals.expenses > 0 && (
                    <View style={styles.tableGroup}>
                      <TouchableOpacity
                        style={styles.tableHeader}
                        onPress={() => toggleTableExpanded('expenses')}
                      >
                        {expandedTables.expenses ? (
                          <ChevronDown color={theme.textMuted} size={16} />
                        ) : (
                          <ChevronRight color={theme.textMuted} size={16} />
                        )}
                        <Text style={[styles.tableTitle, { color: theme.text }]}>
                          Expenses ({pendingSummary.totals.expenses})
                        </Text>
                      </TouchableOpacity>
                      {expandedTables.expenses && pendingSummary.itemsByTable.expenses.map(item => (
                        <View key={item.id} style={[styles.pendingItem, { borderColor: theme.divider }]}>
                          <Text style={[styles.pendingItemName, { color: theme.text }]}>{item.name} - ₱{item.total.toFixed(2)}</Text>
                          <Text style={[styles.pendingItemId, { color: theme.textMuted }]}>ID: {truncateId(item.id)}</Text>
                          <Text style={[styles.pendingItemMeta, { color: theme.warning }]}>created_by: {truncateId(item.createdBy)}</Text>
                          <Text style={[styles.pendingItemMeta, { color: theme.textMuted }]}>Date: {item.date}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {pendingSummary.totals.activities > 0 && (
                    <View style={styles.tableGroup}>
                      <TouchableOpacity
                        style={styles.tableHeader}
                        onPress={() => toggleTableExpanded('activities')}
                      >
                        {expandedTables.activities ? (
                          <ChevronDown color={theme.textMuted} size={16} />
                        ) : (
                          <ChevronRight color={theme.textMuted} size={16} />
                        )}
                        <Text style={[styles.tableTitle, { color: theme.text }]}>
                          Activities ({pendingSummary.totals.activities})
                        </Text>
                      </TouchableOpacity>
                      {expandedTables.activities && pendingSummary.itemsByTable.activities.map(item => (
                        <View key={item.id} style={[styles.pendingItem, { borderColor: theme.divider }]}>
                          <Text style={[styles.pendingItemName, { color: theme.text }]}>{item.type}: {item.description}</Text>
                          <Text style={[styles.pendingItemId, { color: theme.textMuted }]}>ID: {truncateId(item.id)}</Text>
                          <Text style={[styles.pendingItemMeta, { color: theme.warning }]}>user_id: {truncateId(item.userId)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {pendingSummary.totals.total === 0 && (
                    <View style={styles.allSyncedContainer}>
                      <Cloud color={theme.success} size={24} />
                      <Text style={[styles.allSyncedText, { color: theme.success }]}>All items synced!</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.fixSyncButton, { backgroundColor: theme.warning }]}
                    onPress={handleFixAndSync}
                    disabled={isFixingSyncing || syncStatus === 'syncing'}
                  >
                    {isFixingSyncing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Wrench color="#fff" size={18} />
                    )}
                    <Text style={styles.fixSyncButtonText}>
                      {isFixingSyncing ? 'Fixing & Syncing...' : 'Attempt Fix + Sync Now'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.refreshButton, { borderColor: theme.primary }]}
                    onPress={loadPendingSummary}
                    disabled={isLoadingPending}
                  >
                    <RefreshCw color={theme.primary} size={16} />
                    <Text style={[styles.refreshButtonText, { color: theme.primary }]}>Refresh List</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={[styles.noDataText, { color: theme.textMuted }]}>No pending data available</Text>
              )}
            </View>
          )}

          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>About</Text>
            
            <View style={styles.settingRow}>
              <View style={[styles.settingIcon, { backgroundColor: theme.primary + '20' }]}>
                <Info color={theme.primary} size={20} />
              </View>
              <Text style={[styles.settingLabel, { color: theme.text }]}>App Version</Text>
              <Text style={[styles.settingValue, { color: theme.textMuted }]}>{APP_VERSION}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.logoutButton, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            onPress={handleGoToWelcome}
          >
            <LogOut color={theme.warning} size={20} />
            <Text style={[styles.logoutText, { color: theme.warning }]}>Go to Welcome Page</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.logoutButton, { backgroundColor: theme.error + '10', borderColor: theme.error + '30' }]}
            onPress={handleLogout}
          >
            <LogOut color={theme.error} size={20} />
            <Text style={[styles.logoutText, { color: theme.error }]}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={showPinModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Change PIN</Text>
              <TouchableOpacity onPress={() => {
                setShowPinModal(false);
                setNewPin('');
                setConfirmPin('');
                setPinError('');
              }}>
                <X color={theme.textMuted} size={24} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>New PIN (4-12 digits)</Text>
              <View style={[styles.pinInputContainer, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
                <TextInput
                  style={[styles.pinInput, { color: theme.text }]}
                  placeholder="Enter new PIN"
                  placeholderTextColor={theme.textMuted}
                  value={newPin}
                  onChangeText={setNewPin}
                  keyboardType="numeric"
                  secureTextEntry={!showNewPin}
                  maxLength={12}
                />
                <TouchableOpacity onPress={() => setShowNewPin(!showNewPin)}>
                  {showNewPin ? <EyeOff color={theme.textMuted} size={20} /> : <Eye color={theme.textMuted} size={20} />}
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Confirm New PIN</Text>
              <View style={[styles.pinInputContainer, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
                <TextInput
                  style={[styles.pinInput, { color: theme.text }]}
                  placeholder="Confirm new PIN"
                  placeholderTextColor={theme.textMuted}
                  value={confirmPin}
                  onChangeText={setConfirmPin}
                  keyboardType="numeric"
                  secureTextEntry={!showConfirmPin}
                  maxLength={12}
                />
                <TouchableOpacity onPress={() => setShowConfirmPin(!showConfirmPin)}>
                  {showConfirmPin ? <EyeOff color={theme.textMuted} size={20} /> : <Eye color={theme.textMuted} size={20} />}
                </TouchableOpacity>
              </View>

              {pinError ? (
                <Text style={[styles.errorText, { color: theme.error }]}>{pinError}</Text>
              ) : null}

              <Text style={[styles.warningText, { color: theme.warning }]}>
                You will be logged out after changing your PIN.
              </Text>
            </View>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.cardBorder }]}
                onPress={() => {
                  setShowPinModal(false);
                  setNewPin('');
                  setConfirmPin('');
                  setPinError('');
                }}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={handleChangePin}
              >
                <Text style={styles.submitButtonText}>Change PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCreateUserModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Create New User</Text>
              <TouchableOpacity onPress={() => {
                setShowCreateUserModal(false);
                setNewUserName('');
                setNewUserPin('');
                setNewUserRole('inventory_clerk');
                setCreateUserError('');
              }}>
                <X color={theme.textMuted} size={24} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                placeholder="Enter user name"
                placeholderTextColor={theme.textMuted}
                value={newUserName}
                onChangeText={setNewUserName}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>PIN (4-12 digits)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                placeholder="Enter PIN"
                placeholderTextColor={theme.textMuted}
                value={newUserPin}
                onChangeText={setNewUserPin}
                keyboardType="numeric"
                maxLength={12}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Role</Text>
              <TouchableOpacity
                style={[styles.selectButton, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}
                onPress={() => setShowRolePicker(!showRolePicker)}
              >
                <Text style={[styles.selectText, { color: theme.text }]}>
                  {ROLE_DISPLAY_NAMES[newUserRole]}
                </Text>
                <ChevronDown color={theme.textMuted} size={20} />
              </TouchableOpacity>
              
              {showRolePicker && (
                <View style={[styles.pickerDropdown, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
                  {roles.map(role => (
                    <TouchableOpacity
                      key={role}
                      style={styles.pickerOption}
                      onPress={() => { setNewUserRole(role); setShowRolePicker(false); }}
                    >
                      <Text style={[styles.pickerOptionText, { color: theme.text }]}>
                        {ROLE_DISPLAY_NAMES[role]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {createUserError ? (
                <Text style={[styles.errorText, { color: theme.error }]}>{createUserError}</Text>
              ) : null}
            </ScrollView>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.cardBorder }]}
                onPress={() => {
                  setShowCreateUserModal(false);
                  setNewUserName('');
                  setNewUserPin('');
                  setNewUserRole('inventory_clerk');
                  setCreateUserError('');
                }}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.success }]}
                onPress={handleCreateUser}
              >
                <Text style={styles.submitButtonText}>Create User</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPrivacyModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Privacy Policy</Text>
              <TouchableOpacity onPress={() => setShowPrivacyModal(false)}>
                <X color={theme.textMuted} size={24} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.privacyBody} showsVerticalScrollIndicator={false}>
              <Text style={[styles.privacySection, { color: theme.text }]}>Data Collection</Text>
              <Text style={[styles.privacyText, { color: theme.textSecondary }]}>
                MY Food Cart collects and stores data locally on your device including sales records, inventory items, expenses, and user profiles. This data is used solely for the purpose of managing your food cart business operations.
              </Text>

              <Text style={[styles.privacySection, { color: theme.text }]}>Data Storage</Text>
              <Text style={[styles.privacyText, { color: theme.textSecondary }]}>
                Your data is stored locally on your device and may be synced to our secure cloud servers to enable data backup and multi-device access. We use industry-standard encryption to protect your data.
              </Text>

              <Text style={[styles.privacySection, { color: theme.text }]}>Data Sharing</Text>
              <Text style={[styles.privacyText, { color: theme.textSecondary }]}>
                We do not sell, trade, or share your personal data with third parties. Your business information remains confidential and is only accessible by authorized users within your organization.
              </Text>

              <Text style={[styles.privacySection, { color: theme.text }]}>User Rights</Text>
              <Text style={[styles.privacyText, { color: theme.textSecondary }]}>
                You have the right to access, modify, or delete your data at any time. You can export your data or request complete deletion by contacting support.
              </Text>

              <Text style={[styles.privacySection, { color: theme.text }]}>Contact</Text>
              <Text style={[styles.privacyText, { color: theme.textSecondary }]}>
                For questions about this privacy policy or your data, please contact us through the app or visit our GitHub page.
              </Text>

              <TouchableOpacity
                style={[styles.githubLink, { backgroundColor: theme.primary + '20' }]}
                onPress={openGitHubPrivacyPolicy}
              >
                <Text style={[styles.githubLinkText, { color: theme.primary }]}>
                  View Full Privacy Policy on GitHub
                </Text>
              </TouchableOpacity>
            </ScrollView>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={() => setShowPrivacyModal(false)}
              >
                <Text style={styles.submitButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showConnectionTestModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.connectionTestModal, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Connection Test</Text>
              <TouchableOpacity onPress={() => setShowConnectionTestModal(false)}>
                <X color={theme.textMuted} size={24} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.connectionTestBody}>
              {isTestingConnection ? (
                <>
                  <RefreshCw color={theme.primary} size={48} />
                  <Text style={[styles.connectionTestText, { color: theme.textSecondary }]}>Testing connection...</Text>
                </>
              ) : connectionTestResult === 'connected' ? (
                <>
                  <View style={[styles.connectionStatusIcon, { backgroundColor: theme.success + '20' }]}>
                    <Cloud color={theme.success} size={48} />
                  </View>
                  <Text style={[styles.connectionTestResult, { color: theme.success }]}>Connected</Text>
                  <Text style={[styles.connectionTestText, { color: theme.textSecondary }]}>Supabase is configured correctly</Text>
                </>
              ) : (
                <>
                  <View style={[styles.connectionStatusIcon, { backgroundColor: theme.error + '20' }]}>
                    <CloudOff color={theme.error} size={48} />
                  </View>
                  <Text style={[styles.connectionTestResult, { color: theme.error }]}>Not Connected</Text>
                  <Text style={[styles.connectionTestText, { color: theme.textSecondary }]}>Check your Supabase configuration</Text>
                </>
              )}
            </View>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={() => setShowConnectionTestModal(false)}
              >
                <Text style={styles.submitButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <SyncProgressModal 
        visible={showSyncModal} 
        darkMode={settings.darkMode} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingLabel: {
    flex: 1,
    fontSize: 16,
  },
  settingValue: {
    fontSize: 14,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  modalBody: {
    padding: 20,
    maxHeight: 400,
  },
  modalBodyContent: {
    paddingBottom: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  pinInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  pinInput: {
    flex: 1,
    fontSize: 16,
    letterSpacing: 4,
  },
  selectButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: {
    fontSize: 16,
  },
  pickerDropdown: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    overflow: 'hidden',
  },
  pickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  pickerOptionText: {
    fontSize: 16,
  },
  errorText: {
    fontSize: 14,
    marginTop: 12,
  },
  warningText: {
    fontSize: 12,
    marginTop: 16,
    textAlign: 'center',
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
  submitButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  privacyBody: {
    padding: 20,
    maxHeight: 400,
  },
  privacySection: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginTop: 16,
    marginBottom: 8,
  },
  privacyText: {
    fontSize: 14,
    lineHeight: 22,
  },
  githubLink: {
    marginTop: 24,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  githubLinkText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  connectionTestModal: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    overflow: 'hidden',
  },
  connectionTestBody: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
  },
  connectionStatusIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  connectionTestResult: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  connectionTestText: {
    fontSize: 14,
    textAlign: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
  },
  pendingTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  pendingTotalText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  tableGroup: {
    marginBottom: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  tableTitle: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  pendingItem: {
    marginLeft: 32,
    marginRight: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderLeftWidth: 2,
    marginBottom: 4,
  },
  pendingItemName: {
    fontSize: 13,
    fontWeight: '500' as const,
  },
  pendingItemId: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  pendingItemMeta: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  allSyncedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
  },
  allSyncedText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  fixSyncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  fixSyncButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  refreshButtonText: {
    fontSize: 13,
    fontWeight: '500' as const,
  },
  noDataText: {
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },
});
