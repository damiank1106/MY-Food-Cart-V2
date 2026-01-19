import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface LaserBackgroundProps {
  isDarkMode: boolean;
}

export default function LaserBackground({ isDarkMode }: LaserBackgroundProps) {
  const glowAnim = useRef(new Animated.Value(0)).current;

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

  const darkColors = ['rgba(30, 58, 138, 0.4)', 'rgba(37, 99, 235, 0.3)', 'rgba(59, 130, 246, 0.4)', 'rgba(37, 99, 235, 0.3)', 'rgba(30, 58, 138, 0.4)'] as const;
  const lightColors = ['rgba(191, 219, 254, 0.3)', 'rgba(147, 197, 253, 0.4)', 'rgba(96, 165, 250, 0.5)', 'rgba(147, 197, 253, 0.4)', 'rgba(191, 219, 254, 0.3)'] as const;
  const colors = isDarkMode ? darkColors : lightColors;

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
