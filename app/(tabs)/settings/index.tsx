import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock, Moon, HelpCircle, Info, LogOut, Eye, EyeOff, X, UserPlus, ChevronDown, RefreshCw, Cloud, CloudOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';
import { UserRole, ROLE_DISPLAY_NAMES } from '@/types';
import { createUser, isPinTaken } from '@/services/database';
import { useSync } from '@/contexts/SyncContext';

const APP_VERSION = '1.0.0';
const PRIVACY_POLICY_URL = 'https://example.com/privacy-policy';

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

  const isDeveloper = user?.role === 'developer';

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
    await syncBeforeLogout();
    await logout();
    await updateSettings({ hasSeenIntro: false });
    router.replace('/');
  };

  const handleGoToWelcome = async () => {
    await syncBeforeLogout();
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
    Linking.openURL(PRIVACY_POLICY_URL);
  };

  const roles: UserRole[] = ['general_manager', 'operation_manager', 'inventory_clerk', 'developer'];

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
            
            <ScrollView style={styles.modalBody}>
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
    maxHeight: '80%',
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
});
