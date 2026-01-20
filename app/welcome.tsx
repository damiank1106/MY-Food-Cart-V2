import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ShoppingCart, Lock, Eye, EyeOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { useSync } from '@/contexts/SyncContext';
import { Colors } from '@/constants/colors';
import SyncProgressModal from '@/components/SyncProgressModal';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();
  const { login, settings, user, isInitialized } = useAuth();
  const { triggerFullSync } = useSync();
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncStep, setSyncStep] = useState<'uploading' | 'downloading'>('uploading');
  
  const shakeAnimation = useRef(new Animated.Value(0)).current;
  const fadeAnimation = useRef(new Animated.Value(0)).current;
  const slideAnimation = useRef(new Animated.Value(50)).current;

  const theme = settings.darkMode ? Colors.dark : Colors.light;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnimation, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnimation, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnimation, slideAnimation]);

  useEffect(() => {
    if (isInitialized && user) {
      const targetRoute = user.role === 'inventory_clerk' ? '/(tabs)/inventory' : '/home';
      router.replace(targetRoute);
    }
  }, [isInitialized, user, router]);

  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnimation]);

  const handleLogin = async () => {
    if (!pin || pin.length < 4) {
      setError('Please enter your PIN');
      shake();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsLoggingIn(true);
    setError('');

    const result = await login(pin);
    
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsLoggingIn(false);
      
      setShowSyncModal(true);
      setSyncStep('uploading');
      
      setTimeout(() => setSyncStep('downloading'), 1000);
      
      try {
        await triggerFullSync({ reason: 'login' });
      } catch (syncError) {
        console.log('Sync after login failed (continuing anyway):', syncError);
      }
      
      setShowSyncModal(false);
      const targetRoute = result.user?.role === 'inventory_clerk' ? '/(tabs)/inventory' : '/home';
      router.replace(targetRoute);
    } else {
      setError('Invalid PIN. Please try again.');
      shake();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPin('');
      setIsLoggingIn(false);
    }
  };

  const handlePinChange = (text: string) => {
    const numericOnly = text.replace(/[^0-9]/g, '');
    if (numericOnly.length <= 12) {
      setPin(numericOnly);
      setError('');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={[theme.backgroundGradientStart, theme.backgroundGradientEnd]}
        style={StyleSheet.absoluteFill}
      />
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <Animated.View 
          style={[
            styles.content,
            {
              opacity: fadeAnimation,
              transform: [{ translateY: slideAnimation }],
            },
          ]}
        >
          <View style={[styles.logoContainer, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <ShoppingCart color={theme.primary} size={48} />
          </View>
          
          <Text style={[styles.title, { color: theme.text }]}>MY Food Cart</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Enter your PIN to continue
          </Text>

          <Animated.View 
            style={[
              styles.inputContainer,
              { 
                backgroundColor: theme.inputBackground,
                borderColor: error ? theme.error : theme.inputBorder,
                transform: [{ translateX: shakeAnimation }],
              },
            ]}
          >
            <Lock color={theme.textMuted} size={20} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Enter PIN"
              placeholderTextColor={theme.textMuted}
              value={pin}
              onChangeText={handlePinChange}
              keyboardType="numeric"
              secureTextEntry={!showPin}
              maxLength={12}
              autoFocus
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity 
              onPress={() => setShowPin(!showPin)}
              style={styles.eyeButton}
            >
              {showPin ? (
                <EyeOff color={theme.textMuted} size={20} />
              ) : (
                <Eye color={theme.textMuted} size={20} />
              )}
            </TouchableOpacity>
          </Animated.View>

          {error ? (
            <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
          ) : null}

          <TouchableOpacity
            style={[
              styles.loginButton,
              { backgroundColor: theme.primary },
              isLoggingIn && styles.loginButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={isLoggingIn}
            activeOpacity={0.8}
          >
            {isLoggingIn ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </TouchableOpacity>

          <View style={styles.pinHintContainer}>
            <Text style={[styles.pinHint, { color: theme.textMuted }]}>
              PIN: 4-12 digits
            </Text>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
      
      <SyncProgressModal 
        visible={showSyncModal} 
        step={syncStep}
        darkMode={settings.darkMode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: Math.min(width - 48, 400),
    alignItems: 'center',
    padding: 24,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '700' as const,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 32,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 18,
    letterSpacing: 4,
  },
  eyeButton: {
    padding: 8,
  },
  errorText: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  loginButton: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600' as const,
  },
  pinHintContainer: {
    marginTop: 24,
  },
  pinHint: {
    fontSize: 12,
  },
});
