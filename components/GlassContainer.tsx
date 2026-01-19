import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

interface GlassContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  enabled: boolean;
  opacity: 'low' | 'medium' | 'high';
  darkMode: boolean;
}

export default function GlassContainer({ 
  children, 
  style, 
  enabled, 
  opacity,
  darkMode 
}: GlassContainerProps) {
  if (!enabled || !isLiquidGlassAvailable()) {
    return <View style={style}>{children}</View>;
  }

  const opacityMap: Record<'low' | 'medium' | 'high', number> = {
    low: 0.3,
    medium: 0.6,
    high: 0.9,
  };

  const tintOpacity = opacityMap[opacity] || 0.6;
  const tintColor = darkMode 
    ? `rgba(20, 20, 40, ${tintOpacity})` 
    : `rgba(255, 255, 255, ${tintOpacity})`;

  return (
    <GlassView 
      style={style} 
      glassEffectStyle="regular"
      tintColor={tintColor}
    >
      {children}
    </GlassView>
  );
}
