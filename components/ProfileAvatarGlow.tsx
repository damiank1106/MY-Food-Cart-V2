import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Image,
} from 'react-native';
import { User, Camera } from 'lucide-react-native';

interface ProfileAvatarGlowProps {
  imageUri?: string | null;
  size?: number;
  onPressCamera?: () => void;
  fallbackText?: string;
  glowColor?: string;
  primaryColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  iconColor?: string;
}

export default function ProfileAvatarGlow({
  imageUri,
  size = 120,
  onPressCamera,
  fallbackText,
  glowColor = 'rgba(74, 144, 217, 0.5)',
  primaryColor = '#4a90d9',
  backgroundColor = '#142238',
  borderColor = '#1e3a5f',
  iconColor = '#5a7a9a',
}: ProfileAvatarGlowProps) {
  const glowOpacity = useRef(new Animated.Value(0.35)).current;
  const glowScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowOpacity, {
            toValue: 0.75,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glowScale, {
            toValue: 1.06,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(glowOpacity, {
            toValue: 0.35,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glowScale, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    pulseAnimation.start();

    return () => {
      pulseAnimation.stop();
    };
  }, [glowOpacity, glowScale]);

  const glowSize = size + 24;
  const cameraButtonSize = 40;
  const cameraOffset = 8;

  return (
    <View style={[styles.container, { width: size + 60, height: size + 60 }]}>
      <Animated.View
        style={[
          styles.glowRing,
          {
            width: glowSize,
            height: glowSize,
            borderRadius: glowSize / 2,
            backgroundColor: glowColor,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />
      
      <View
        style={[
          styles.avatarContainer,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: backgroundColor,
            borderColor: borderColor,
          },
        ]}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.avatar} />
        ) : fallbackText ? (
          <View style={styles.fallbackContainer}>
            <Animated.Text
              style={[
                styles.fallbackText,
                { fontSize: size * 0.4, color: iconColor },
              ]}
            >
              {fallbackText.charAt(0).toUpperCase()}
            </Animated.Text>
          </View>
        ) : (
          <User color={iconColor} size={size * 0.5} />
        )}
      </View>

      {onPressCamera && (
        <TouchableOpacity
          style={[
            styles.cameraButton,
            {
              width: cameraButtonSize,
              height: cameraButtonSize,
              borderRadius: cameraButtonSize / 2,
              backgroundColor: primaryColor,
              bottom: cameraOffset,
              right: cameraOffset,
            },
          ]}
          onPress={onPressCamera}
          activeOpacity={0.8}
        >
          <Camera color="#fff" size={18} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
  },
  avatarContainer: {
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    fontWeight: '600' as const,
  },
  cameraButton: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});
