import React, { useEffect, useMemo } from 'react';
import { 
  View, 
  StyleSheet, 
  TouchableOpacity, 
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

const videoSource = require('../assets/videos/intro.webm');

export default function IntroScreen() {
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const { isLoading, isInitialized, settings, markIntroSeen, user } = useAuth();

  const hasValidDimensions = width > 0 && height > 0;
  const safeWidth = hasValidDimensions ? width : 1;
  const safeHeight = hasValidDimensions ? height : 1;

  const isTablet = Math.min(safeWidth, safeHeight) >= 600;
  const isLandscape = safeWidth > safeHeight;
  const isTabletLandscape = isTablet && isLandscape;

  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });

  const theme = settings.darkMode ? Colors.dark : Colors.light;

  const nativeVideoStyle = useMemo(
    () => [
      styles.video,
      {
        width: safeWidth,
        height: safeHeight,
      },
    ],
    [safeWidth, safeHeight]
  );

  useEffect(() => {
    if (!isLoading && isInitialized) {
      if (settings.hasSeenIntro) {
        if (user) {
          const targetRoute = user.role === 'inventory_clerk' ? '/(tabs)/inventory' : '/(tabs)/home';
          console.log('[PIN FLOW] Intro auth redirect to:', targetRoute);
          router.replace(targetRoute);
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
          {/* Web: Uses HTML5 video element for better compatibility */}
          <video
            autoPlay
            loop
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' } as React.CSSProperties}
          >
            <source src="/assets/videos/intro.webm" type="video/webm" />
          </video>
        </View>
      ) : (
        <View style={styles.nativeVideoContainer}>
          <VideoView
              player={player}
              style={nativeVideoStyle}
              contentFit={isTabletLandscape ? 'cover' : 'contain'}
              nativeControls={false}
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
    position: 'absolute',
    left: 0,
    top: 0,
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
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
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
