import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

interface LaserBackgroundProps {
  isDarkMode: boolean;
}

export default function LaserBackground({ isDarkMode }: LaserBackgroundProps) {
  const numLasers = 6;
  const laserAnimations = useRef(
    Array.from({ length: numLasers }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    const animations = laserAnimations.map((anim, index) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(index * 800),
          Animated.timing(anim, {
            toValue: 1,
            duration: 4000,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
    });

    animations.forEach((anim) => anim.start());

    return () => {
      animations.forEach((anim) => anim.stop());
    };
  }, [laserAnimations]);

  const laserColor = isDarkMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)';
  const laserGlow = isDarkMode ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.15)';

  return (
    <View style={styles.container} pointerEvents="none">
      {laserAnimations.map((anim, index) => {
        const translateY = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [-height, height * 2],
        });

        const opacity = anim.interpolate({
          inputRange: [0, 0.2, 0.8, 1],
          outputRange: [0, 1, 1, 0],
        });

        const rotation = -35 + (index % 3) * 15;
        const leftPosition = (index / numLasers) * width;

        return (
          <Animated.View
            key={index}
            style={[
              styles.laser,
              {
                left: leftPosition,
                transform: [{ translateY }, { rotate: `${rotation}deg` }],
                opacity,
              },
            ]}
          >
            <View
              style={[
                styles.laserBeam,
                {
                  backgroundColor: laserColor,
                  shadowColor: laserGlow,
                },
              ]}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  laser: {
    position: 'absolute',
    width: 3,
    height: height * 1.5,
    top: -height,
  },
  laserBeam: {
    width: '100%',
    height: '100%',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 5,
  },
});
