import { Stack } from "expo-router";
import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";

export default function SalesLayout() {
  const { settings } = useAuth();
  const theme = settings.darkMode ? Colors.dark : Colors.light;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
