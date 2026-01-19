import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

interface GlassContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  enabled: boolean;
  intensity: number;
  darkMode: boolean;
}

export default function GlassContainer({ 
  children, 
  style, 
  enabled, 
  intensity,
  darkMode 
}: GlassContainerProps) {
  if (!enabled || !isLiquidGlassAvailable()) {
    return <View style={style}>{children}</View>;
  }

  const opacityMap: Record<number, number> = {
    1: 0.1,
    2: 0.2,
    3: 0.3,
    4: 0.4,
    5: 0.5,
    6: 0.6,
    7: 0.7,
    8: 0.8,
    9: 0.9,
    10: 1.0,
  };

  const tintOpacity = opacityMap[intensity] || 0.5;
  const tintColor = darkMode 
    ? `rgba(255, 255, 255, ${tintOpacity * 0.15})` 
    : `rgba(255, 255, 255, ${tintOpacity * 0.85})`;

  return (
    <GlassView 
      style={style} 
      glassEffectStyle={intensity > 5 ? 'regular' : 'clear'}
      tintColor={tintColor}
    >
      {children}
    </GlassView>
  );
}
