import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, Save, User } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';
import { ROLE_DISPLAY_NAMES } from '@/types';

const BIO_STORAGE_KEY = '@myfoodcart_user_bio';

export default function ProfileScreen() {
  const { user, settings, updateCurrentUser } = useAuth();
  const theme = settings.darkMode ? Colors.dark : Colors.light;
  
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [bio, setBio] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(user?.profilePicture || null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadBio = useCallback(async () => {
    try {
      const savedBio = await AsyncStorage.getItem(`${BIO_STORAGE_KEY}_${user?.id}`);
      if (savedBio) {
        setBio(savedBio);
      }
    } catch (error) {
      console.log('Error loading bio:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    loadBio();
  }, [loadBio]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.name);
      setProfileImage(user.profilePicture || null);
    }
  }, [user]);

  const handlePickImage = async (useCamera: boolean) => {
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permission is required to take photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });
      if (!result.canceled && result.assets[0]) {
        setProfileImage(result.assets[0].uri);
        setHasChanges(true);
      }
    } else {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });
      if (!result.canceled && result.assets[0]) {
        setProfileImage(result.assets[0].uri);
        setHasChanges(true);
      }
    }
  };

  const showImagePickerOptions = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            handlePickImage(true);
          } else if (buttonIndex === 2) {
            handlePickImage(false);
          }
        }
      );
    } else {
      Alert.alert(
        'Change Profile Photo',
        'Select an option',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Take Photo', onPress: () => handlePickImage(true) },
          { text: 'Choose from Library', onPress: () => handlePickImage(false) },
        ],
        { cancelable: true }
      );
    }
  };

  const handleSave = async () => {
    if (!user || isSaving) return;
    
    setIsSaving(true);
    try {
      await updateCurrentUser({
        name: displayName.trim() || user.name,
        profilePicture: profileImage || undefined,
      });

      await AsyncStorage.setItem(`${BIO_STORAGE_KEY}_${user.id}`, bio);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHasChanges(false);
    } catch (error) {
      console.log('Error saving profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNameChange = (text: string) => {
    setDisplayName(text);
    setHasChanges(true);
  };

  const handleBioChange = (text: string) => {
    setBio(text);
    setHasChanges(true);
  };

  const isDeveloper = user?.role === 'developer';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={[theme.backgroundGradientStart, theme.backgroundGradientEnd]}
        style={StyleSheet.absoluteFill}
      />
      
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.divider }]}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Profile</Text>
          {hasChanges && (
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: theme.primary }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              <Save color="#fff" size={18} />
              <Text style={styles.saveButtonText}>
                {isSaving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrapper}>
              <View
                style={[styles.avatarContainer, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
              >
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.avatar} />
                ) : (
                  <User color={theme.textMuted} size={60} />
                )}
              </View>
              <TouchableOpacity 
                style={[styles.cameraButton, { backgroundColor: theme.primary }]}
                onPress={showImagePickerOptions}
              >
                <Camera color="#fff" size={18} />
              </TouchableOpacity>
            </View>
            
            {isDeveloper && user?.role && (
              <View style={[styles.roleBadge, { backgroundColor: theme.primary + '20' }]}>
                <Text style={[styles.roleText, { color: theme.primary }]}>
                  {ROLE_DISPLAY_NAMES[user.role]}
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Display Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
              placeholder="Enter your name"
              placeholderTextColor={theme.textMuted}
              value={displayName}
              onChangeText={handleNameChange}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Bio (Local Only)</Text>
            <TextInput
              style={[
                styles.input,
                styles.bioInput,
                { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }
              ]}
              placeholder="Tell us about yourself..."
              placeholderTextColor={theme.textMuted}
              value={bio}
              onChangeText={handleBioChange}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Text style={[styles.helperText, { color: theme.textMuted }]}>
              {"Bio is stored locally and won't sync to cloud"}
            </Text>
          </View>

          <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.infoTitle, { color: theme.text }]}>Account Info</Text>
            
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>User ID</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>{user?.id?.slice(0, 12)}...</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Created</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
              </Text>
            </View>

            {isDeveloper && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Role</Text>
                <Text style={[styles.infoValue, { color: theme.primary }]}>
                  {user?.role ? ROLE_DISPLAY_NAMES[user.role] : 'N/A'}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  cameraButton: {
    position: 'absolute',
    bottom: -4,
    right: -8,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  roleBadge: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  roleText: {
    fontSize: 13,
    fontWeight: '500' as const,
  },
  formCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
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
  bioInput: {
    height: 100,
    paddingTop: 12,
    paddingBottom: 12,
  },
  helperText: {
    fontSize: 12,
    marginTop: 8,
  },
  infoCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
});
