import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import { Colors } from '@/constants/colors';

interface SyncProgressModalProps {
  visible: boolean;
  step?: 'uploading' | 'downloading';
  darkMode?: boolean;
}

export default function SyncProgressModal({ 
  visible, 
  step = 'uploading',
  darkMode = true 
}: SyncProgressModalProps) {
  const theme = darkMode ? Colors.dark : Colors.light;

  const stepText = step === 'uploading' 
    ? 'Uploading changes…' 
    : 'Downloading updates…';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.card }]}>
          <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
            <RefreshCw color={theme.primary} size={28} />
          </View>
          
          <Text style={[styles.title, { color: theme.text }]}>
            Synchronizing…
          </Text>
          
          <ActivityIndicator 
            size="large" 
            color={theme.primary} 
            style={styles.spinner}
          />
          
          <Text style={[styles.stepText, { color: theme.textSecondary }]}>
            {stepText}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 300,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600' as const,
    marginBottom: 20,
    textAlign: 'center',
  },
  spinner: {
    marginBottom: 16,
  },
  stepText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
