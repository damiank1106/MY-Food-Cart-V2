import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ActionSheetIOS,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Save } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';
import { ROLE_DISPLAY_NAMES } from '@/types';
import ProfileAvatarGlow from '@/components/ProfileAvatarGlow';
import LaserBackground from '@/components/LaserBackground';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

const BIO_STORAGE_KEY = '@myfoodcart_user_bio';

export default function ProfileScreen() {
  const { user, settings, updateCurrentUser } = useAuth();
  const theme = settings.darkMode ? Colors.dark : Colors.light;
  
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const leftRailWidth = 110;

  const [displayName, setDisplayName] = useState(user?.name || '');
  const [bio, setBio] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(user?.profilePicture || null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadUserData = useCallback(async () => {
    if (!user) return;
    
    try {
      setDisplayName(user.name || '');
      setProfileImage(user.profilePicture || null);
      
      const savedBio = await AsyncStorage.getItem(`${BIO_STORAGE_KEY}_${user.id}`);
      if (savedBio !== null) {
        setBio(savedBio);
      }
      console.log('Profile data loaded - name:', user.name, 'bio:', savedBio);
    } catch (error) {
      console.log('Error loading profile data:', error);
    }
  }, [user]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

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
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Media library permission is required to choose photos.');
        return;
      }
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

  const handleRemovePhoto = () => {
    setProfileImage(null);
    setHasChanges(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const showImagePickerOptions = () => {
    const hasPhoto = !!profileImage;
    
    if (Platform.OS === 'ios') {
      const options = hasPhoto 
        ? ['Cancel', 'Take Photo', 'Choose from Library', 'Remove Photo']
        : ['Cancel', 'Take Photo', 'Choose from Library'];
      const destructiveButtonIndex = hasPhoto ? 3 : undefined;
      
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            handlePickImage(true);
          } else if (buttonIndex === 2) {
            handlePickImage(false);
          } else if (buttonIndex === 3 && hasPhoto) {
            handleRemovePhoto();
          }
        }
      );
    } else {
      const buttons: {
        text: string;
        onPress?: () => void;
        style?: 'default' | 'cancel' | 'destructive';
      }[] = [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: () => handlePickImage(true) },
        { text: 'Choose from Library', onPress: () => handlePickImage(false) },
      ];
      
      if (hasPhoto) {
        buttons.push({
          text: 'Remove Photo',
          onPress: () => handleRemovePhoto(),
          style: 'destructive',
        });
      }
      
      Alert.alert(
        'Change Profile Photo',
        'Select an option',
        buttons,
        { cancelable: true }
      );
    }
  };

  const handleSave = async () => {
    if (!user || isSaving) return;
    
    setIsSaving(true);
    try {
      const newName = displayName.trim();
      
      await updateCurrentUser({
        name: newName,
        profilePicture: profileImage || undefined,
      });

      await AsyncStorage.setItem(`${BIO_STORAGE_KEY}_${user.id}`, bio);
      
      console.log('Profile saved - name:', newName, 'bio:', bio);
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
  const shouldShowBlankIfEmpty = ['inventory_clerk', 'general_manager', 'operation_manager'].includes(user?.role || '');

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={[theme.backgroundGradientStart, theme.backgroundGradientEnd]}
        style={StyleSheet.absoluteFill}
      />
      {settings.laserBackground && (
        <LaserBackground isDarkMode={settings.darkMode} colorPalette={settings.backgroundColorPalette} intensity={settings.backgroundIntensity} />
      )}
      
      <SafeAreaView
        style={[styles.safeArea, isLandscape && { paddingLeft: leftRailWidth + 16, paddingRight: 16 }]}
        edges={['top']}
      >
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
          contentContainerStyle={[styles.contentContainer, isLandscape ? { paddingBottom: insets.bottom + 16 } : { paddingBottom: tabBarHeight + insets.bottom + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarSection}>
            <ProfileAvatarGlow
              imageUri={profileImage}
              size={120}
              onPressCamera={showImagePickerOptions}
              onPressRemove={handleRemovePhoto}
              fallbackText={shouldShowBlankIfEmpty ? (displayName.trim() || undefined) : (displayName || user?.name)}
              glowColor={settings.darkMode ? 'rgba(74, 144, 217, 0.4)' : 'rgba(59, 130, 246, 0.35)'}
              primaryColor={theme.primary}
              backgroundColor={theme.card}
              borderColor={theme.cardBorder}
              iconColor={theme.textMuted}
            />
            
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
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
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
