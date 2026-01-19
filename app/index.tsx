import React, { useEffect, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  TouchableOpacity, 
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import { ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

const { width, height } = Dimensions.get('window');

export default function IntroScreen() {
  const router = useRouter();
  const { isLoading, isInitialized, settings, markIntroSeen, user } = useAuth();
  const videoRef = useRef<Video>(null);

  const theme = settings.darkMode ? Colors.dark : Colors.light;

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
      
      {Platform.OS === 'web' ? (
        <View style={styles.webVideoContainer}>
          {/* 
            PLACEHOLDER: Replace the src below with your local video path.
            To use a local video:
            1. Add your video file to: assets/videos/intro.webm
            2. Update the source src to: src="/assets/videos/intro.webm"
          */}
          <video
            autoPlay
            loop
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' } as React.CSSProperties}
          >
            <source src="https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/w9yigrrx8luuuiv2awdgw" type="video/mp4" />
          </video>
        </View>
      ) : (
        <View style={styles.nativeVideoContainer}>
          {/* 
            PLACEHOLDER: Replace the URI below with your local video file.
            To use a local video:
            1. Add your video file to: assets/videos/intro.mp4
            2. Replace the source line with: source={require('@/assets/videos/intro.mp4')}
            Note: Use .mp4 format for best iOS/Android compatibility
          */}
          <Video
            ref={videoRef}
            source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/w9yigrrx8luuuiv2awdgw' }}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            isMuted
            onError={(e) => console.log('Video error:', e)}
          />
        </View>
      )}

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
    height: height,
    position: 'absolute',
  },
  webVideoContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  webVideoPlaceholder: {
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
