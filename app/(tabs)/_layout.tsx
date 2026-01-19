import { Tabs } from "expo-router";
import { Home, Package, TrendingUp, User, Settings } from "lucide-react-native";
import React from "react";
import { Platform, useWindowDimensions } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";

export default function TabLayout() {
  const { user, settings } = useAuth();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  
  const theme = settings.darkMode ? Colors.dark : Colors.light;
  
  const isInventoryClerk = user?.role === 'inventory_clerk';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tabIconSelected,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: 1,
          paddingBottom: Platform.OS === 'ios' ? 28 : 16,
          paddingTop: 10,
          height: Platform.OS === 'ios' ? 94 : 72,
          ...(isTablet && {
            position: 'absolute' as const,
            left: 0,
            top: 0,
            bottom: 0,
            width: 88,
            height: '100%',
            flexDirection: 'column' as const,
            paddingTop: 60,
            paddingBottom: 28,
            borderTopWidth: 0,
            borderRightWidth: 1,
            borderRightColor: theme.tabBarBorder,
          }),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500' as const,
        },
        headerShown: false,
        ...(isTablet && {
          tabBarPosition: 'left' as const,
        }),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
          href: isInventoryClerk ? null : "/(tabs)/home",
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: "Inventory",
          tabBarIcon: ({ color, size }) => <Package color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: "Sales",
          tabBarIcon: ({ color, size }) => <TrendingUp color={color} size={size} />,
          href: isInventoryClerk ? null : "/(tabs)/sales",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
