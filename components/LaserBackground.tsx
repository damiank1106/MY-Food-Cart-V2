import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BackgroundColorPalette, BackgroundIntensity } from '@/types';

interface LaserBackgroundProps {
  isDarkMode: boolean;
  colorPalette: BackgroundColorPalette;
  intensity: BackgroundIntensity;
}

const COLOR_PALETTES = {
  blue: {
    dark: {
      low: ['rgba(30, 58, 138, 0.3)', 'rgba(37, 99, 235, 0.25)', 'rgba(59, 130, 246, 0.3)', 'rgba(37, 99, 235, 0.25)', 'rgba(30, 58, 138, 0.3)'] as const,
      medium: ['rgba(30, 58, 138, 0.6)', 'rgba(37, 99, 235, 0.5)', 'rgba(59, 130, 246, 0.65)', 'rgba(37, 99, 235, 0.5)', 'rgba(30, 58, 138, 0.6)'] as const,
      high: ['rgba(30, 58, 138, 0.85)', 'rgba(37, 99, 235, 0.75)', 'rgba(59, 130, 246, 0.9)', 'rgba(37, 99, 235, 0.75)', 'rgba(30, 58, 138, 0.85)'] as const,
    },
    light: {
      low: ['rgba(191, 219, 254, 0.25)', 'rgba(147, 197, 253, 0.3)', 'rgba(96, 165, 250, 0.35)', 'rgba(147, 197, 253, 0.3)', 'rgba(191, 219, 254, 0.25)'] as const,
      medium: ['rgba(191, 219, 254, 0.5)', 'rgba(147, 197, 253, 0.6)', 'rgba(96, 165, 250, 0.7)', 'rgba(147, 197, 253, 0.6)', 'rgba(191, 219, 254, 0.5)'] as const,
      high: ['rgba(191, 219, 254, 0.75)', 'rgba(147, 197, 253, 0.85)', 'rgba(96, 165, 250, 0.95)', 'rgba(147, 197, 253, 0.85)', 'rgba(191, 219, 254, 0.75)'] as const,
    },
  },
  purple: {
    dark: {
      low: ['rgba(88, 28, 135, 0.3)', 'rgba(126, 34, 206, 0.25)', 'rgba(168, 85, 247, 0.3)', 'rgba(126, 34, 206, 0.25)', 'rgba(88, 28, 135, 0.3)'] as const,
      medium: ['rgba(88, 28, 135, 0.6)', 'rgba(126, 34, 206, 0.5)', 'rgba(168, 85, 247, 0.65)', 'rgba(126, 34, 206, 0.5)', 'rgba(88, 28, 135, 0.6)'] as const,
      high: ['rgba(88, 28, 135, 0.85)', 'rgba(126, 34, 206, 0.75)', 'rgba(168, 85, 247, 0.9)', 'rgba(126, 34, 206, 0.75)', 'rgba(88, 28, 135, 0.85)'] as const,
    },
    light: {
      low: ['rgba(233, 213, 255, 0.25)', 'rgba(216, 180, 254, 0.3)', 'rgba(192, 132, 252, 0.35)', 'rgba(216, 180, 254, 0.3)', 'rgba(233, 213, 255, 0.25)'] as const,
      medium: ['rgba(233, 213, 255, 0.5)', 'rgba(216, 180, 254, 0.6)', 'rgba(192, 132, 252, 0.7)', 'rgba(216, 180, 254, 0.6)', 'rgba(233, 213, 255, 0.5)'] as const,
      high: ['rgba(233, 213, 255, 0.75)', 'rgba(216, 180, 254, 0.85)', 'rgba(192, 132, 252, 0.95)', 'rgba(216, 180, 254, 0.85)', 'rgba(233, 213, 255, 0.75)'] as const,
    },
  },
  green: {
    dark: {
      low: ['rgba(20, 83, 45, 0.3)', 'rgba(22, 163, 74, 0.25)', 'rgba(34, 197, 94, 0.3)', 'rgba(22, 163, 74, 0.25)', 'rgba(20, 83, 45, 0.3)'] as const,
      medium: ['rgba(20, 83, 45, 0.6)', 'rgba(22, 163, 74, 0.5)', 'rgba(34, 197, 94, 0.65)', 'rgba(22, 163, 74, 0.5)', 'rgba(20, 83, 45, 0.6)'] as const,
      high: ['rgba(20, 83, 45, 0.85)', 'rgba(22, 163, 74, 0.75)', 'rgba(34, 197, 94, 0.9)', 'rgba(22, 163, 74, 0.75)', 'rgba(20, 83, 45, 0.85)'] as const,
    },
    light: {
      low: ['rgba(187, 247, 208, 0.25)', 'rgba(134, 239, 172, 0.3)', 'rgba(74, 222, 128, 0.35)', 'rgba(134, 239, 172, 0.3)', 'rgba(187, 247, 208, 0.25)'] as const,
      medium: ['rgba(187, 247, 208, 0.5)', 'rgba(134, 239, 172, 0.6)', 'rgba(74, 222, 128, 0.7)', 'rgba(134, 239, 172, 0.6)', 'rgba(187, 247, 208, 0.5)'] as const,
      high: ['rgba(187, 247, 208, 0.75)', 'rgba(134, 239, 172, 0.85)', 'rgba(74, 222, 128, 0.95)', 'rgba(134, 239, 172, 0.85)', 'rgba(187, 247, 208, 0.75)'] as const,
    },
  },
  orange: {
    dark: {
      low: ['rgba(124, 45, 18, 0.3)', 'rgba(194, 65, 12, 0.25)', 'rgba(249, 115, 22, 0.3)', 'rgba(194, 65, 12, 0.25)', 'rgba(124, 45, 18, 0.3)'] as const,
      medium: ['rgba(124, 45, 18, 0.6)', 'rgba(194, 65, 12, 0.5)', 'rgba(249, 115, 22, 0.65)', 'rgba(194, 65, 12, 0.5)', 'rgba(124, 45, 18, 0.6)'] as const,
      high: ['rgba(124, 45, 18, 0.85)', 'rgba(194, 65, 12, 0.75)', 'rgba(249, 115, 22, 0.9)', 'rgba(194, 65, 12, 0.75)', 'rgba(124, 45, 18, 0.85)'] as const,
    },
    light: {
      low: ['rgba(254, 215, 170, 0.25)', 'rgba(253, 186, 116, 0.3)', 'rgba(251, 146, 60, 0.35)', 'rgba(253, 186, 116, 0.3)', 'rgba(254, 215, 170, 0.25)'] as const,
      medium: ['rgba(254, 215, 170, 0.5)', 'rgba(253, 186, 116, 0.6)', 'rgba(251, 146, 60, 0.7)', 'rgba(253, 186, 116, 0.6)', 'rgba(254, 215, 170, 0.5)'] as const,
      high: ['rgba(254, 215, 170, 0.75)', 'rgba(253, 186, 116, 0.85)', 'rgba(251, 146, 60, 0.95)', 'rgba(253, 186, 116, 0.85)', 'rgba(254, 215, 170, 0.75)'] as const,
    },
  },
  pink: {
    dark: {
      low: ['rgba(131, 24, 67, 0.3)', 'rgba(190, 24, 93, 0.25)', 'rgba(236, 72, 153, 0.3)', 'rgba(190, 24, 93, 0.25)', 'rgba(131, 24, 67, 0.3)'] as const,
      medium: ['rgba(131, 24, 67, 0.6)', 'rgba(190, 24, 93, 0.5)', 'rgba(236, 72, 153, 0.65)', 'rgba(190, 24, 93, 0.5)', 'rgba(131, 24, 67, 0.6)'] as const,
      high: ['rgba(131, 24, 67, 0.85)', 'rgba(190, 24, 93, 0.75)', 'rgba(236, 72, 153, 0.9)', 'rgba(190, 24, 93, 0.75)', 'rgba(131, 24, 67, 0.85)'] as const,
    },
    light: {
      low: ['rgba(252, 231, 243, 0.25)', 'rgba(251, 207, 232, 0.3)', 'rgba(244, 114, 182, 0.35)', 'rgba(251, 207, 232, 0.3)', 'rgba(252, 231, 243, 0.25)'] as const,
      medium: ['rgba(252, 231, 243, 0.5)', 'rgba(251, 207, 232, 0.6)', 'rgba(244, 114, 182, 0.7)', 'rgba(251, 207, 232, 0.6)', 'rgba(252, 231, 243, 0.5)'] as const,
      high: ['rgba(252, 231, 243, 0.75)', 'rgba(251, 207, 232, 0.85)', 'rgba(244, 114, 182, 0.95)', 'rgba(251, 207, 232, 0.85)', 'rgba(252, 231, 243, 0.75)'] as const,
    },
  },
  cyan: {
    dark: {
      low: ['rgba(21, 94, 117, 0.3)', 'rgba(14, 165, 233, 0.25)', 'rgba(34, 211, 238, 0.3)', 'rgba(14, 165, 233, 0.25)', 'rgba(21, 94, 117, 0.3)'] as const,
      medium: ['rgba(21, 94, 117, 0.6)', 'rgba(14, 165, 233, 0.5)', 'rgba(34, 211, 238, 0.65)', 'rgba(14, 165, 233, 0.5)', 'rgba(21, 94, 117, 0.6)'] as const,
      high: ['rgba(21, 94, 117, 0.85)', 'rgba(14, 165, 233, 0.75)', 'rgba(34, 211, 238, 0.9)', 'rgba(14, 165, 233, 0.75)', 'rgba(21, 94, 117, 0.85)'] as const,
    },
    light: {
      low: ['rgba(207, 250, 254, 0.25)', 'rgba(165, 243, 252, 0.3)', 'rgba(103, 232, 249, 0.35)', 'rgba(165, 243, 252, 0.3)', 'rgba(207, 250, 254, 0.25)'] as const,
      medium: ['rgba(207, 250, 254, 0.5)', 'rgba(165, 243, 252, 0.6)', 'rgba(103, 232, 249, 0.7)', 'rgba(165, 243, 252, 0.6)', 'rgba(207, 250, 254, 0.5)'] as const,
      high: ['rgba(207, 250, 254, 0.75)', 'rgba(165, 243, 252, 0.85)', 'rgba(103, 232, 249, 0.95)', 'rgba(165, 243, 252, 0.85)', 'rgba(207, 250, 254, 0.75)'] as const,
    },
  },
};

export default function LaserBackground({ isDarkMode, colorPalette, intensity }: LaserBackgroundProps) {
  const glowAnim = useRef(new Animated.Value(0)).current;
  const safeColorPalette = colorPalette && COLOR_PALETTES[colorPalette] ? colorPalette : 'blue';
  const safeIntensity = intensity || 'high';

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 3500,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 3500,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [glowAnim]);

  const getOpacityRange = () => {
    switch (safeIntensity) {
      case 'low':
        return [0.3, 0.5];
      case 'medium':
        return [0.5, 0.8];
      case 'high':
        return [0.7, 1.0];
      default:
        return [0.7, 1.0];
    }
  };

  const opacityRange = getOpacityRange();
  const opacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: opacityRange,
  });

  const colors = isDarkMode 
    ? COLOR_PALETTES[safeColorPalette].dark[safeIntensity] 
    : COLOR_PALETTES[safeColorPalette].light[safeIntensity];

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[styles.glowContainer, { opacity }]}>
        <LinearGradient
          colors={colors}
          locations={[0, 0.25, 0.5, 0.75, 1]}
          style={styles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  glowContainer: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
});
