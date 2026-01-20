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
      low: ['rgba(37, 99, 235, 0.45)', 'rgba(59, 130, 246, 0.5)', 'rgba(96, 165, 250, 0.55)', 'rgba(59, 130, 246, 0.5)', 'rgba(37, 99, 235, 0.45)'] as const,
      medium: ['rgba(37, 99, 235, 0.7)', 'rgba(59, 130, 246, 0.8)', 'rgba(96, 165, 250, 0.85)', 'rgba(59, 130, 246, 0.8)', 'rgba(37, 99, 235, 0.7)'] as const,
      high: ['rgba(59, 130, 246, 0.95)', 'rgba(96, 165, 250, 1)', 'rgba(147, 197, 253, 1)', 'rgba(96, 165, 250, 1)', 'rgba(59, 130, 246, 0.95)'] as const,
    },
    light: {
      low: ['rgba(96, 165, 250, 0.4)', 'rgba(147, 197, 253, 0.45)', 'rgba(191, 219, 254, 0.5)', 'rgba(147, 197, 253, 0.45)', 'rgba(96, 165, 250, 0.4)'] as const,
      medium: ['rgba(96, 165, 250, 0.65)', 'rgba(147, 197, 253, 0.75)', 'rgba(191, 219, 254, 0.85)', 'rgba(147, 197, 253, 0.75)', 'rgba(96, 165, 250, 0.65)'] as const,
      high: ['rgba(96, 165, 250, 0.9)', 'rgba(147, 197, 253, 1)', 'rgba(191, 219, 254, 1)', 'rgba(147, 197, 253, 1)', 'rgba(96, 165, 250, 0.9)'] as const,
    },
  },
  purple: {
    dark: {
      low: ['rgba(126, 34, 206, 0.45)', 'rgba(168, 85, 247, 0.5)', 'rgba(192, 132, 252, 0.55)', 'rgba(168, 85, 247, 0.5)', 'rgba(126, 34, 206, 0.45)'] as const,
      medium: ['rgba(126, 34, 206, 0.7)', 'rgba(168, 85, 247, 0.8)', 'rgba(192, 132, 252, 0.85)', 'rgba(168, 85, 247, 0.8)', 'rgba(126, 34, 206, 0.7)'] as const,
      high: ['rgba(168, 85, 247, 0.95)', 'rgba(192, 132, 252, 1)', 'rgba(216, 180, 254, 1)', 'rgba(192, 132, 252, 1)', 'rgba(168, 85, 247, 0.95)'] as const,
    },
    light: {
      low: ['rgba(192, 132, 252, 0.4)', 'rgba(216, 180, 254, 0.45)', 'rgba(233, 213, 255, 0.5)', 'rgba(216, 180, 254, 0.45)', 'rgba(192, 132, 252, 0.4)'] as const,
      medium: ['rgba(192, 132, 252, 0.65)', 'rgba(216, 180, 254, 0.75)', 'rgba(233, 213, 255, 0.85)', 'rgba(216, 180, 254, 0.75)', 'rgba(192, 132, 252, 0.65)'] as const,
      high: ['rgba(192, 132, 252, 0.9)', 'rgba(216, 180, 254, 1)', 'rgba(233, 213, 255, 1)', 'rgba(216, 180, 254, 1)', 'rgba(192, 132, 252, 0.9)'] as const,
    },
  },
  green: {
    dark: {
      low: ['rgba(22, 163, 74, 0.45)', 'rgba(34, 197, 94, 0.5)', 'rgba(74, 222, 128, 0.55)', 'rgba(34, 197, 94, 0.5)', 'rgba(22, 163, 74, 0.45)'] as const,
      medium: ['rgba(22, 163, 74, 0.7)', 'rgba(34, 197, 94, 0.8)', 'rgba(74, 222, 128, 0.85)', 'rgba(34, 197, 94, 0.8)', 'rgba(22, 163, 74, 0.7)'] as const,
      high: ['rgba(34, 197, 94, 0.95)', 'rgba(74, 222, 128, 1)', 'rgba(134, 239, 172, 1)', 'rgba(74, 222, 128, 1)', 'rgba(34, 197, 94, 0.95)'] as const,
    },
    light: {
      low: ['rgba(74, 222, 128, 0.4)', 'rgba(134, 239, 172, 0.45)', 'rgba(187, 247, 208, 0.5)', 'rgba(134, 239, 172, 0.45)', 'rgba(74, 222, 128, 0.4)'] as const,
      medium: ['rgba(74, 222, 128, 0.65)', 'rgba(134, 239, 172, 0.75)', 'rgba(187, 247, 208, 0.85)', 'rgba(134, 239, 172, 0.75)', 'rgba(74, 222, 128, 0.65)'] as const,
      high: ['rgba(74, 222, 128, 0.9)', 'rgba(134, 239, 172, 1)', 'rgba(187, 247, 208, 1)', 'rgba(134, 239, 172, 1)', 'rgba(74, 222, 128, 0.9)'] as const,
    },
  },
  orange: {
    dark: {
      low: ['rgba(194, 65, 12, 0.45)', 'rgba(249, 115, 22, 0.5)', 'rgba(251, 146, 60, 0.55)', 'rgba(249, 115, 22, 0.5)', 'rgba(194, 65, 12, 0.45)'] as const,
      medium: ['rgba(194, 65, 12, 0.7)', 'rgba(249, 115, 22, 0.8)', 'rgba(251, 146, 60, 0.85)', 'rgba(249, 115, 22, 0.8)', 'rgba(194, 65, 12, 0.7)'] as const,
      high: ['rgba(249, 115, 22, 0.95)', 'rgba(251, 146, 60, 1)', 'rgba(253, 186, 116, 1)', 'rgba(251, 146, 60, 1)', 'rgba(249, 115, 22, 0.95)'] as const,
    },
    light: {
      low: ['rgba(251, 146, 60, 0.4)', 'rgba(253, 186, 116, 0.45)', 'rgba(254, 215, 170, 0.5)', 'rgba(253, 186, 116, 0.45)', 'rgba(251, 146, 60, 0.4)'] as const,
      medium: ['rgba(251, 146, 60, 0.65)', 'rgba(253, 186, 116, 0.75)', 'rgba(254, 215, 170, 0.85)', 'rgba(253, 186, 116, 0.75)', 'rgba(251, 146, 60, 0.65)'] as const,
      high: ['rgba(251, 146, 60, 0.9)', 'rgba(253, 186, 116, 1)', 'rgba(254, 215, 170, 1)', 'rgba(253, 186, 116, 1)', 'rgba(251, 146, 60, 0.9)'] as const,
    },
  },
  pink: {
    dark: {
      low: ['rgba(190, 24, 93, 0.45)', 'rgba(236, 72, 153, 0.5)', 'rgba(244, 114, 182, 0.55)', 'rgba(236, 72, 153, 0.5)', 'rgba(190, 24, 93, 0.45)'] as const,
      medium: ['rgba(190, 24, 93, 0.7)', 'rgba(236, 72, 153, 0.8)', 'rgba(244, 114, 182, 0.85)', 'rgba(236, 72, 153, 0.8)', 'rgba(190, 24, 93, 0.7)'] as const,
      high: ['rgba(236, 72, 153, 0.95)', 'rgba(244, 114, 182, 1)', 'rgba(251, 207, 232, 1)', 'rgba(244, 114, 182, 1)', 'rgba(236, 72, 153, 0.95)'] as const,
    },
    light: {
      low: ['rgba(244, 114, 182, 0.4)', 'rgba(251, 207, 232, 0.45)', 'rgba(252, 231, 243, 0.5)', 'rgba(251, 207, 232, 0.45)', 'rgba(244, 114, 182, 0.4)'] as const,
      medium: ['rgba(244, 114, 182, 0.65)', 'rgba(251, 207, 232, 0.75)', 'rgba(252, 231, 243, 0.85)', 'rgba(251, 207, 232, 0.75)', 'rgba(244, 114, 182, 0.65)'] as const,
      high: ['rgba(244, 114, 182, 0.9)', 'rgba(251, 207, 232, 1)', 'rgba(252, 231, 243, 1)', 'rgba(251, 207, 232, 1)', 'rgba(244, 114, 182, 0.9)'] as const,
    },
  },
  cyan: {
    dark: {
      low: ['rgba(14, 165, 233, 0.45)', 'rgba(34, 211, 238, 0.5)', 'rgba(103, 232, 249, 0.55)', 'rgba(34, 211, 238, 0.5)', 'rgba(14, 165, 233, 0.45)'] as const,
      medium: ['rgba(14, 165, 233, 0.7)', 'rgba(34, 211, 238, 0.8)', 'rgba(103, 232, 249, 0.85)', 'rgba(34, 211, 238, 0.8)', 'rgba(14, 165, 233, 0.7)'] as const,
      high: ['rgba(34, 211, 238, 0.95)', 'rgba(103, 232, 249, 1)', 'rgba(165, 243, 252, 1)', 'rgba(103, 232, 249, 1)', 'rgba(34, 211, 238, 0.95)'] as const,
    },
    light: {
      low: ['rgba(103, 232, 249, 0.4)', 'rgba(165, 243, 252, 0.45)', 'rgba(207, 250, 254, 0.5)', 'rgba(165, 243, 252, 0.45)', 'rgba(103, 232, 249, 0.4)'] as const,
      medium: ['rgba(103, 232, 249, 0.65)', 'rgba(165, 243, 252, 0.75)', 'rgba(207, 250, 254, 0.85)', 'rgba(165, 243, 252, 0.75)', 'rgba(103, 232, 249, 0.65)'] as const,
      high: ['rgba(103, 232, 249, 0.9)', 'rgba(165, 243, 252, 1)', 'rgba(207, 250, 254, 1)', 'rgba(165, 243, 252, 1)', 'rgba(103, 232, 249, 0.9)'] as const,
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
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2500,
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
        return [0.3, 0.75];
      case 'medium':
        return [0.5, 0.95];
      case 'high':
        return [0.75, 1.0];
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
