import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BackgroundColorPalette } from '@/types';

interface LaserBackgroundProps {
  isDarkMode: boolean;
  colorPalette: BackgroundColorPalette;
}

const COLOR_PALETTES = {
  blue: {
    dark: ['rgba(30, 58, 138, 0.4)', 'rgba(37, 99, 235, 0.3)', 'rgba(59, 130, 246, 0.4)', 'rgba(37, 99, 235, 0.3)', 'rgba(30, 58, 138, 0.4)'] as const,
    light: ['rgba(191, 219, 254, 0.3)', 'rgba(147, 197, 253, 0.4)', 'rgba(96, 165, 250, 0.5)', 'rgba(147, 197, 253, 0.4)', 'rgba(191, 219, 254, 0.3)'] as const,
  },
  purple: {
    dark: ['rgba(88, 28, 135, 0.4)', 'rgba(126, 34, 206, 0.3)', 'rgba(168, 85, 247, 0.4)', 'rgba(126, 34, 206, 0.3)', 'rgba(88, 28, 135, 0.4)'] as const,
    light: ['rgba(233, 213, 255, 0.3)', 'rgba(216, 180, 254, 0.4)', 'rgba(192, 132, 252, 0.5)', 'rgba(216, 180, 254, 0.4)', 'rgba(233, 213, 255, 0.3)'] as const,
  },
  green: {
    dark: ['rgba(20, 83, 45, 0.4)', 'rgba(22, 163, 74, 0.3)', 'rgba(34, 197, 94, 0.4)', 'rgba(22, 163, 74, 0.3)', 'rgba(20, 83, 45, 0.4)'] as const,
    light: ['rgba(187, 247, 208, 0.3)', 'rgba(134, 239, 172, 0.4)', 'rgba(74, 222, 128, 0.5)', 'rgba(134, 239, 172, 0.4)', 'rgba(187, 247, 208, 0.3)'] as const,
  },
  orange: {
    dark: ['rgba(124, 45, 18, 0.4)', 'rgba(194, 65, 12, 0.3)', 'rgba(249, 115, 22, 0.4)', 'rgba(194, 65, 12, 0.3)', 'rgba(124, 45, 18, 0.4)'] as const,
    light: ['rgba(254, 215, 170, 0.3)', 'rgba(253, 186, 116, 0.4)', 'rgba(251, 146, 60, 0.5)', 'rgba(253, 186, 116, 0.4)', 'rgba(254, 215, 170, 0.3)'] as const,
  },
  pink: {
    dark: ['rgba(131, 24, 67, 0.4)', 'rgba(190, 24, 93, 0.3)', 'rgba(236, 72, 153, 0.4)', 'rgba(190, 24, 93, 0.3)', 'rgba(131, 24, 67, 0.4)'] as const,
    light: ['rgba(252, 231, 243, 0.3)', 'rgba(251, 207, 232, 0.4)', 'rgba(244, 114, 182, 0.5)', 'rgba(251, 207, 232, 0.4)', 'rgba(252, 231, 243, 0.3)'] as const,
  },
  cyan: {
    dark: ['rgba(21, 94, 117, 0.4)', 'rgba(14, 165, 233, 0.3)', 'rgba(34, 211, 238, 0.4)', 'rgba(14, 165, 233, 0.3)', 'rgba(21, 94, 117, 0.4)'] as const,
    light: ['rgba(207, 250, 254, 0.3)', 'rgba(165, 243, 252, 0.4)', 'rgba(103, 232, 249, 0.5)', 'rgba(165, 243, 252, 0.4)', 'rgba(207, 250, 254, 0.3)'] as const,
  },
};

export default function LaserBackground({ isDarkMode, colorPalette }: LaserBackgroundProps) {
  const glowAnim = useRef(new Animated.Value(0)).current;
  const safeColorPalette = colorPalette && COLOR_PALETTES[colorPalette] ? colorPalette : 'blue';

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 4000,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [glowAnim]);

  const opacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.7],
  });

  const colors = isDarkMode ? COLOR_PALETTES[safeColorPalette].dark : COLOR_PALETTES[safeColorPalette].light;

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
