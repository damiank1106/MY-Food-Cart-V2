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

  const getGlassStyle = (level: number): 'clear' | 'regular' => {
    if (level <= 5) return 'clear';
    return 'regular';
  };

  const opacityMap: Record<number, number> = {
    1: 0.05,
    2: 0.12,
    3: 0.20,
    4: 0.30,
    5: 0.40,
    6: 0.50,
    7: 0.60,
    8: 0.70,
    9: 0.82,
    10: 0.95,
  };

  const tintOpacity = opacityMap[intensity] || 0.5;
  const tintColor = darkMode 
    ? `rgba(255, 255, 255, ${tintOpacity * 0.25})` 
    : `rgba(255, 255, 255, ${tintOpacity})`;

  return (
    <GlassView 
      style={style} 
      glassEffectStyle={getGlassStyle(intensity)}
      tintColor={tintColor}
    >
      {children}
    </GlassView>
  );
}
