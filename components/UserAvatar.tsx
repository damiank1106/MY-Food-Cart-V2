import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

interface UserAvatarProps {
  name: string;
  imageUri?: string | null;
  size?: number;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}

export default function UserAvatar({
  name,
  imageUri,
  size = 40,
  backgroundColor,
  borderColor,
  textColor,
}: UserAvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
          borderColor,
        },
      ]}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.image} />
      ) : (
        <Text style={[styles.initial, { color: textColor, fontSize: Math.max(14, size * 0.4) }]}>
          {initial}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  initial: {
    fontWeight: '700',
  },
});
