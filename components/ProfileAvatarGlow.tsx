import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Image,
} from 'react-native';
import { User, Camera, Trash2 } from 'lucide-react-native';

interface ProfileAvatarGlowProps {
  imageUri?: string | null;
  size?: number;
  onPressCamera?: () => void;
  onPressAvatar?: () => void;
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
  onPressAvatar,
  fallbackText,
  glowColor = 'rgba(74, 144, 217, 0.6)',
  primaryColor = '#4a90d9',
  backgroundColor = '#142238',
  borderColor = '#1e3a5f',
  iconColor = '#5a7a9a',
}: ProfileAvatarGlowProps) {
  const numLasers = 8;
  const laserRotations = useRef(
    Array.from({ length: numLasers }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    const laserAnimations = laserRotations.map((rotation, index) => {
      const startDelay = (index / numLasers) * 3000;
      return Animated.loop(
        Animated.sequence([
          Animated.delay(startDelay),
          Animated.timing(rotation, {
            toValue: 1,
            duration: 3000,
            useNativeDriver: true,
          }),
        ])
      );
    });

    laserAnimations.forEach((anim) => anim.start());

    return () => {
      laserAnimations.forEach((anim) => anim.stop());
    };
  }, [laserRotations]);

  const glowSize = size + 24;
  const cameraButtonSize = 40;
  const cameraOffset = 8;

  return (
    <View style={[styles.container, { width: size + 60, height: size + 60 }]}>
      <View style={[styles.laserContainer, { width: glowSize, height: glowSize }]}>
        {laserRotations.map((rotation, index) => {
          const rotate = rotation.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '360deg'],
          });
          
          return (
            <Animated.View
              key={index}
              style={[
                styles.laser,
                {
                  width: glowSize,
                  height: 3,
                  backgroundColor: glowColor,
                  transform: [
                    { rotate: `${(index * 360) / numLasers}deg` },
                    { rotate },
                  ],
                },
              ]}
            />
          );
        })}
      </View>
      
      <TouchableOpacity
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
        onPress={onPressAvatar}
        disabled={!onPressAvatar}
        activeOpacity={onPressAvatar ? 0.8 : 1}
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
        
        {imageUri && onPressAvatar && (
          <View style={styles.trashOverlay}>
            <View style={[styles.trashButton, { backgroundColor: '#ef4444' }]}>
              <Trash2 color="#fff" size={24} />
            </View>
          </View>
        )}
      </TouchableOpacity>

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
  laserContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  laser: {
    position: 'absolute',
    shadowColor: '#4a90d9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 8,
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
  trashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trashButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
});
