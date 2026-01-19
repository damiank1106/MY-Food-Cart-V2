import React, { useEffect, useRef, useState } from 'react';
import { 
  View, 
  StyleSheet, 
  TouchableOpacity, 
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import { Asset } from 'expo-asset';
import { ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

const { width, height } = Dimensions.get('window');

// For bigger screens, make video much taller while keeping width
const isLargeScreen = width >= 768;
const videoHeight = isLargeScreen ? height * 1.8 : height;

export default function IntroScreen() {
  const router = useRouter();
  const { isLoading, isInitialized, settings, markIntroSeen, user } = useAuth();
  const videoRef = useRef<Video>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);

  const theme = settings.darkMode ? Colors.dark : Colors.light;

  useEffect(() => {
    const loadVideo = async () => {
      try {
        if (Platform.OS === 'web') {
          setVideoUri('/assets/videos/intro.webm');
        } else {
          const asset = Asset.fromModule(require('../assets/videos/intro.webm'));
          await asset.downloadAsync();
          setVideoUri(asset.localUri || asset.uri);
        }
      } catch (error) {
        console.log('Video loading error:', error);
        setVideoError(true);
      }
    };
    loadVideo();
  }, []);

  useEffect(() => {
    if (!isLoading && isInitialized) {
      if (settings.hasSeenIntro) {
        if (user) {
          router.replace('/home');
        } else {
          router.replace('/welcome');
        }
      }
    }
  }, [isLoading, isInitialized, settings.hasSeenIntro, user, router]);

  const handleNext = async () => {
    await markIntroSeen();
    router.replace('/welcome');
  };

  if (isLoading || !isInitialized) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (settings.hasSeenIntro) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={[theme.backgroundGradientStart, theme.backgroundGradientEnd]}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={styles.nativeVideoContainer}>
        {videoUri && !videoError ? (
          <Video
            ref={videoRef}
            source={{ uri: videoUri }}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            isMuted={false}
            onError={(e) => {
              console.log('Video playback error:', e);
              setVideoError(true);
            }}
          />
        ) : (
          <View style={[styles.video, { backgroundColor: theme.backgroundGradientEnd }]} />
        )}
      </View>

      <TouchableOpacity 
        style={[styles.nextButton, { backgroundColor: theme.primary }]}
        onPress={handleNext}
        activeOpacity={0.8}
      >
        <ChevronRight color="#fff" size={32} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: width,
    height: videoHeight,
    position: 'absolute',
  },
  webVideoContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  nativeVideoContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  placeholderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  placeholderText: {
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },
  nextButton: {
    position: 'absolute',
    bottom: 50,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
