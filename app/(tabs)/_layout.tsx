import { Tabs } from "expo-router";
import { Home, Package, TrendingUp, User, Settings } from "lucide-react-native";
import React from "react";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { Colors } from "@/constants/colors";

export default function TabLayout() {
  const LEFT_RAIL_WIDTH = 84;
  const { user, settings } = useAuth();
  const { pendingCount } = useSync();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const useLeftRailLayout = isLandscape && width >= 900;
  const tabBarPosition = useLeftRailLayout ? 'left' : 'bottom';
  const useHorizontalTabBar = tabBarPosition === 'top' || tabBarPosition === 'bottom';

  React.useEffect(() => {
    console.log('[PIN FLOW] Tabs layout resolved', {
      width,
      height,
      isLandscape,
      useLeftRailLayout,
    });
  }, [height, isLandscape, useLeftRailLayout, width]);

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
          display: 'flex',
          opacity: 1,
          overflow: 'visible',
          ...(useLeftRailLayout
            ? {
                position: 'absolute' as const,
                left: 0,
                top: 0,
                bottom: 0,
                width: LEFT_RAIL_WIDTH,
                minWidth: LEFT_RAIL_WIDTH,
                maxWidth: LEFT_RAIL_WIDTH,
                height: '100%' as const,
                paddingTop: insets.top + 16,
                paddingBottom: insets.bottom + 16,
                paddingHorizontal: 8,
                borderTopWidth: 0,
                borderRightWidth: 1,
                borderRightColor: theme.tabBarBorder,
                zIndex: 50,
                elevation: 20,
              }
            : {
                position: 'absolute' as const,
                left: 0,
                right: 0,
                bottom: 0,
                height: 80 + insets.bottom,
                paddingBottom: insets.bottom,
                paddingTop: 8,
              }),
        },
        tabBarShowLabel: !useLeftRailLayout,
        tabBarLabelStyle: useLeftRailLayout
          ? undefined
          : {
              fontSize: 11,
              fontWeight: '500' as const,
            },
        headerShown: false,
        tabBarHideOnKeyboard: false,
        tabBarLabelPosition: useHorizontalTabBar ? 'below-icon' : 'beside-icon',
        tabBarVariant: useHorizontalTabBar ? 'uikit' : 'material',
        tabBarItemStyle: useLeftRailLayout
          ? {
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              marginVertical: 2,
              paddingVertical: 0,
              paddingHorizontal: 0,
              borderRadius: 12,
            }
          : undefined,
        tabBarIconStyle: useLeftRailLayout
          ? {
              marginRight: 0,
              marginLeft: 0,
            }
          : undefined,
        tabBarPosition,
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
          tabBarIcon: ({ color, size }) => (
            <View style={{ width: size, height: size }}>
              <Settings color={color} size={size} />
              {pendingCount > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -1,
                    right: -1,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.warning,
                  }}
                />
              )}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
