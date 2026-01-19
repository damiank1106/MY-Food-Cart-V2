import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AnimatedLaserBackgroundProps {
  isDarkMode: boolean;
}

export default function AnimatedLaserBackground({ isDarkMode }: AnimatedLaserBackgroundProps) {
  const numLasers = 6;
  const laserAnimations = useRef(
    Array.from({ length: numLasers }, () => ({
      translateY: new Animated.Value(-SCREEN_HEIGHT),
      opacity: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    const animations = laserAnimations.map((laser, index) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(index * 2000),
          Animated.parallel([
            Animated.timing(laser.translateY, {
              toValue: SCREEN_HEIGHT * 2,
              duration: 8000,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(laser.opacity, {
                toValue: 0.3,
                duration: 1000,
                useNativeDriver: true,
              }),
              Animated.delay(6000),
              Animated.timing(laser.opacity, {
                toValue: 0,
                duration: 1000,
                useNativeDriver: true,
              }),
            ]),
          ]),
          Animated.delay(4000),
        ])
      );
    });

    animations.forEach((anim) => anim.start());

    return () => {
      animations.forEach((anim) => anim.stop());
    };
  }, [laserAnimations]);

  const laserPositions = [
    { left: SCREEN_WIDTH * 0.1 },
    { left: SCREEN_WIDTH * 0.25 },
    { left: SCREEN_WIDTH * 0.45 },
    { left: SCREEN_WIDTH * 0.6 },
    { left: SCREEN_WIDTH * 0.75 },
    { left: SCREEN_WIDTH * 0.9 },
  ];

  const laserColor = isDarkMode 
    ? 'rgba(74, 144, 217, 0.3)' 
    : 'rgba(59, 130, 246, 0.25)';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {laserAnimations.map((laser, index) => (
        <Animated.View
          key={index}
          style={[
            styles.laser,
            {
              opacity: laser.opacity,
              transform: [
                { translateY: laser.translateY },
                { rotate: '25deg' },
              ],
              left: laserPositions[index].left,
              backgroundColor: laserColor,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  laser: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.4,
    height: 3,
    top: -SCREEN_HEIGHT,
    shadowColor: '#4a90d9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 5,
  },
});
