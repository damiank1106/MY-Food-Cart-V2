import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Package, ShoppingCart, User, Settings, RefreshCw } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/contexts/AuthContext';
import { useSync } from '@/contexts/SyncContext';
import { Colors } from '@/constants/colors';

import { useRouter } from 'expo-router';
import { formatDate, ROLE_DISPLAY_NAMES, UserRole } from '@/types';
import { getWeeklySalesTotals, getWeeklyExpenseTotals, getActivities, getUsers, getSalesByDateRange, getExpensesByDateRange } from '@/services/database';
import { getDayKeysForWeek, getWeekdayLabels, getWeekRange, getWeekStart, toLocalDayKey } from '@/services/dateUtils';
import WeeklyLineChart, { WeeklyLineSeries } from '@/components/WeeklyLineChart';
import LaserBackground from '@/components/LaserBackground';

const { width } = Dimensions.get('window');

function formatWeekRange(start: Date, end: Date): string {
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endDay = end.getDate();
  
  if (startMonth === endMonth) {
    return `${startMonth}\n${startDay}-${endDay}`;
  }
  return `${startMonth} ${startDay}-\n${endMonth} ${endDay}`;
}

function getActivityIcon(type: string, color: string) {
  switch (type) {
    case 'inventory_add':
    case 'inventory_update':
    case 'inventory_delete':
      return <Package color={color} size={20} />;
    case 'sale_add':
    case 'expense_add':
      return <ShoppingCart color={color} size={20} />;
    case 'profile_update':
      return <User color={color} size={20} />;
    case 'settings_change':
      return <Settings color={color} size={20} />;
    default:
      return <Package color={color} size={20} />;
  }
}

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

const AUTHOR_VISIBLE_ROLES: UserRole[] = ['general_manager', 'operation_manager', 'developer'];
type SplitKey = 'op' | 'gm' | 'fd';

const normalizeSplitRole = (value: string): SplitKey | null => {
  const normalized = value.toLowerCase().replace(/[\s_-]/g, '');
  if (['operationmanager', 'operationsmanager', 'op', 'operations'].includes(normalized)) return 'op';
  if (['generalmanager', 'gm', 'general'].includes(normalized)) return 'gm';
  if (['foodcart', 'fd', 'food'].includes(normalized)) return 'fd';
  if (['inventoryclerk', 'developer', 'worker', 'staff'].includes(normalized)) return 'fd';
  return null;
};

const roleToSplitKey = (role?: UserRole | null): SplitKey => {
  if (role === 'operation_manager') return 'op';
  if (role === 'general_manager') return 'gm';
  return 'fd';
};

export default function HomeScreen() {
  const router = useRouter();
  const { settings, user: currentUser } = useAuth();
  const { dataVersion, pendingCount, lastSyncTime } = useSync();
  const theme = settings.darkMode ? Colors.dark : Colors.light;

  useEffect(() => {
    if (currentUser?.role === 'inventory_clerk') {
      console.log('Inventory clerk detected on Home screen, redirecting to Inventory');
      router.replace('/(tabs)/inventory');
    }
  }, [currentUser, router]);

  if (currentUser?.role === 'inventory_clerk') {
    return null;
  }
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [isOverviewRefreshing, setIsOverviewRefreshing] = useState(false);
  const [showSales, setShowSales] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);
  const [showSplitOp, setShowSplitOp] = useState(true);
  const [showSplitGm, setShowSplitGm] = useState(true);
  const [showSplitFd, setShowSplitFd] = useState(true);
  const [overviewTab, setOverviewTab] = useState<'overview' | 'netSplit'>('overview');
  const overviewRefreshInFlight = useRef(false);

  const toggleSplitSeries = useCallback((key: SplitKey) => {
    if (key === 'op') {
      setShowSplitOp(prev => !prev);
      return;
    }
    if (key === 'gm') {
      setShowSplitGm(prev => !prev);
      return;
    }
    setShowSplitFd(prev => !prev);
  }, []);

  const { width: screenWidth } = useWindowDimensions();
  
  const welcomeFontSize = screenWidth < 360 ? 18 : screenWidth < 400 ? 20 : 24;
  const isSmallScreen = screenWidth < 360;

  const weekStartsOn = 0;

  const weeks = useMemo(() => {
    return [0, 1, 2, 3].map(i => {
      const { start, end } = getWeekRange(i, weekStartsOn);
      return { start, end, label: formatWeekRange(start, end) };
    });
  }, [weekStartsOn]);

  const currentWeek = weeks[selectedWeek];
  const startDateStr = toLocalDayKey(currentWeek.start);
  const endDateStr = toLocalDayKey(currentWeek.end);



  const { data: salesTotalsMap = {}, refetch: refetchSales } = useQuery({
    queryKey: ['weeklySalesTotals', startDateStr, endDateStr],
    queryFn: () => getWeeklySalesTotals(startDateStr, endDateStr),
  });

  const { data: expensesTotalsMap = {}, refetch: refetchExpenses } = useQuery({
    queryKey: ['weeklyExpenseTotals', startDateStr, endDateStr],
    queryFn: () => getWeeklyExpenseTotals(startDateStr, endDateStr),
  });

  const { data: weeklySales = [], refetch: refetchWeeklySales } = useQuery({
    queryKey: ['weeklySalesEntries', startDateStr, endDateStr],
    queryFn: () => getSalesByDateRange(startDateStr, endDateStr),
  });

  const { data: weeklyExpenses = [], refetch: refetchWeeklyExpenses } = useQuery({
    queryKey: ['weeklyExpenseEntries', startDateStr, endDateStr],
    queryFn: () => getExpensesByDateRange(startDateStr, endDateStr),
  });

  const { data: activities = [], refetch: refetchActivities } = useQuery({
    queryKey: ['activities'],
    queryFn: getActivities,
  });

  const { data: users = [], refetch: refetchUsers } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const userMap = useMemo(() => {
    const map = new Map<string, { name: string; role: UserRole }>();
    for (const u of users) {
      map.set(u.id, { name: u.name, role: u.role });
    }
    return map;
  }, [users]);

  const userNameMap = useMemo(() => {
    const map = new Map<string, UserRole>();
    for (const u of users) {
      const normalizedName = u.name?.trim().toLowerCase();
      if (normalizedName) {
        map.set(normalizedName, u.role);
      }
    }
    return map;
  }, [users]);

  const getAuthorDisplayName = useCallback((userId: string): string => {
    const author = userMap.get(userId);
    if (!author) return 'Unknown';
    if (author.name && author.name.trim() !== '') {
      return author.name;
    }
    return ROLE_DISPLAY_NAMES[author.role] || 'Unknown';
  }, [userMap]);

  const canViewAuthor = currentUser && AUTHOR_VISIBLE_ROLES.includes(currentUser.role);

  const weekStart = useMemo(
    () => getWeekStart(currentWeek.start, weekStartsOn),
    [currentWeek.start, weekStartsOn]
  );
  const weekDayKeys = useMemo(() => getDayKeysForWeek(weekStart), [weekStart]);
  const weekDayLabels = useMemo(() => getWeekdayLabels(weekStartsOn), [weekStartsOn]);

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_DEBUG_WEEKLY_CHART === 'true') {
      const labelCount = weekDayLabels.length;
      const keyCount = weekDayKeys.length;
      if (labelCount !== keyCount) {
        console.warn('Weekly chart labels/day keys mismatch', { labelCount, keyCount });
      } else {
        console.log('Weekly chart alignment check', { weekDayLabels, weekDayKeys });
      }
    }
  }, [weekDayKeys, weekDayLabels]);

  const salesByDay = useMemo(() => {
    return new Map(Object.entries(salesTotalsMap).map(([key, value]) => [key, Number(value) || 0]));
  }, [salesTotalsMap]);

  const expensesByDay = useMemo(() => {
    return new Map(Object.entries(expensesTotalsMap).map(([key, value]) => [key, Number(value) || 0]));
  }, [expensesTotalsMap]);

  const salesSeries = useMemo(
    () => weekDayKeys.map(key => salesByDay.get(key) ?? 0),
    [salesByDay, weekDayKeys]
  );

  const expensesSeries = useMemo(
    () => weekDayKeys.map(key => expensesByDay.get(key) ?? 0),
    [expensesByDay, weekDayKeys]
  );

  const chartData = useMemo(() => {
    return weekDayKeys.map((dateStr, index) => {
      const day = weekDayLabels[index] ?? '';
      const daySales = salesSeries[index] ?? 0;
      const dayExpenses = expensesSeries[index] ?? 0;

      return { day, sales: daySales, expenses: dayExpenses, dateStr };
    });
  }, [expensesSeries, salesSeries, weekDayKeys, weekDayLabels]);

  const weekTotals = useMemo(() => {
    const salesTotal = salesSeries.reduce((sum, val) => sum + val, 0);
    const expensesTotal = expensesSeries.reduce((sum, val) => sum + val, 0);
    console.log(`Week totals (${startDateStr} to ${endDateStr}): Sales=₱${salesTotal}, Expenses=₱${expensesTotal}`);
    return { sales: salesTotal, expenses: expensesTotal, net: salesTotal - expensesTotal };
  }, [expensesSeries, salesSeries, startDateStr, endDateStr]);

  const netSplitByDay = useMemo(() => {
    const dayTotals = new Map(
      weekDayKeys.map(key => [key, { op: 0, gm: 0, fd: 0 }])
    );

    const getRoleHint = (record: Record<string, unknown>) => {
      const candidates = [
        record.createdByRole,
        record['created_by_role'],
        record.userRole,
        record['user_role'],
        record.role,
        record.source,
        record.accountType,
        record['account_type'],
        record.postedBy,
        record['posted_by'],
        record.device_user_role,
      ];
      for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate;
      }
      return null;
    };

    const resolveBucket = (record: { createdBy?: string; createdByRole?: string | null }) => {
      const recordHint = getRoleHint(record as Record<string, unknown>);
      if (recordHint) {
        const normalizedHint = normalizeSplitRole(recordHint);
        if (normalizedHint) return normalizedHint;
      }

      const createdBy = record.createdBy ?? '';
      if (createdBy) {
        const userRole = userMap.get(createdBy)?.role;
        if (userRole) return roleToSplitKey(userRole);
        const nameRole = userNameMap.get(createdBy.trim().toLowerCase());
        if (nameRole) return roleToSplitKey(nameRole);
        const normalizedCreatedBy = normalizeSplitRole(createdBy);
        if (normalizedCreatedBy) return normalizedCreatedBy;
      }

      return 'fd';
    };

    for (const sale of weeklySales) {
      const dayKey = toLocalDayKey(sale.date);
      const bucket = dayTotals.get(dayKey);
      if (!bucket) continue;
      const key = resolveBucket(sale);
      bucket[key] += Number(sale.total || 0);
    }

    for (const expense of weeklyExpenses) {
      const dayKey = toLocalDayKey(expense.date);
      const bucket = dayTotals.get(dayKey);
      if (!bucket) continue;
      const key = resolveBucket(expense);
      bucket[key] -= Number(expense.total || 0);
    }

    return dayTotals;
  }, [userMap, userNameMap, weekDayKeys, weeklyExpenses, weeklySales]);

  const netSplitChartData = useMemo(() => {
    return weekDayKeys.map((dateStr, index) => {
      const day = weekDayLabels[index] ?? '';
      const bucket = netSplitByDay.get(dateStr) ?? { op: 0, gm: 0, fd: 0 };
      return {
        day,
        dateStr,
        op: bucket.op,
        gm: bucket.gm,
        fd: bucket.fd,
      };
    });
  }, [netSplitByDay, weekDayKeys, weekDayLabels]);

  const netSplitTotals = useMemo(() => {
    return netSplitChartData.reduce(
      (totals, day) => {
        totals.op += day.op;
        totals.gm += day.gm;
        totals.fd += day.fd;
        return totals;
      },
      { op: 0, gm: 0, fd: 0 }
    );
  }, [netSplitChartData]);

  const splitSeriesConfig = useMemo(
    () => ([
      { key: 'op' as const, label: 'OP', color: theme.success, enabled: showSplitOp },
      { key: 'gm' as const, label: 'GM', color: theme.primary, enabled: showSplitGm },
      { key: 'fd' as const, label: 'FD', color: theme.warning, enabled: showSplitFd },
    ]),
    [showSplitOp, showSplitGm, showSplitFd, theme.primary, theme.success, theme.warning]
  );

  const visibleNetSplitTotals = useMemo(
    () => ({
      op: showSplitOp ? netSplitTotals.op : 0,
      gm: showSplitGm ? netSplitTotals.gm : 0,
      fd: showSplitFd ? netSplitTotals.fd : 0,
    }),
    [netSplitTotals, showSplitOp, showSplitGm, showSplitFd]
  );

  const rawMaxValue = Math.max(...chartData.map(d => Math.max(d.sales, d.expenses)), 100);
  
  const getYAxisConfig = (maxVal: number) => {
    if (maxVal <= 200) return { max: 200, step: 50 };
    if (maxVal <= 500) return { max: 500, step: 100 };
    if (maxVal <= 1000) return { max: 1000, step: 200 };
    if (maxVal <= 2000) return { max: 2000, step: 500 };
    if (maxVal <= 5000) return { max: 5000, step: 1000 };
    if (maxVal <= 10000) return { max: 10000, step: 2000 };
    if (maxVal <= 20000) return { max: 20000, step: 5000 };
    if (maxVal <= 50000) return { max: 50000, step: 10000 };
    if (maxVal <= 100000) return { max: 100000, step: 20000 };
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)));
    const normalized = Math.ceil(maxVal / magnitude) * magnitude;
    return { max: normalized, step: normalized / 5 };
  };

  const yAxisConfig = getYAxisConfig(rawMaxValue);
  const maxValue = yAxisConfig.max;
  

  const chartHeight = 150;
  const chartWidth = width - 80;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refetchSales(),
      refetchExpenses(),
      refetchWeeklySales(),
      refetchWeeklyExpenses(),
      refetchActivities(),
      refetchUsers(),
    ]);
    setRefreshing(false);
  }, [refetchSales, refetchExpenses, refetchWeeklySales, refetchWeeklyExpenses, refetchActivities, refetchUsers]);

  const handleOverviewRefresh = useCallback(async () => {
    if (overviewRefreshInFlight.current) return;
    overviewRefreshInFlight.current = true;
    setIsOverviewRefreshing(true);
    try {
      await Promise.all([
        refetchSales(),
        refetchExpenses(),
        refetchWeeklySales(),
        refetchWeeklyExpenses(),
        refetchUsers(),
      ]);
    } finally {
      setIsOverviewRefreshing(false);
      overviewRefreshInFlight.current = false;
    }
  }, [refetchSales, refetchExpenses, refetchWeeklySales, refetchWeeklyExpenses, refetchUsers]);

  useEffect(() => {
    handleOverviewRefresh();
  }, [dataVersion, handleOverviewRefresh, pendingCount, lastSyncTime]);

  useFocusEffect(
    useCallback(() => {
      handleOverviewRefresh();
    }, [handleOverviewRefresh])
  );

  const overviewSeries = useMemo<WeeklyLineSeries[]>(() => ([
    {
      key: 'sales',
      color: theme.chartLine,
      values: chartData.map(point => point.sales),
      enabled: showSales,
      pointRadius: 4,
      gradientOpacity: { start: 0.3, end: 0.05 },
    },
    {
      key: 'expenses',
      color: theme.error,
      values: chartData.map(point => point.expenses),
      enabled: showExpenses,
      dashed: true,
      pointRadius: 3,
      gradientOpacity: { start: 0.2, end: 0.02 },
    },
  ]), [chartData, showSales, showExpenses, theme.chartLine, theme.error]);

  const netSplitSeries = useMemo<WeeklyLineSeries[]>(() => (
    splitSeriesConfig.map(series => ({
      key: series.key,
      color: series.color,
      values: netSplitChartData.map(point => point[series.key]),
      enabled: series.enabled,
      pointRadius: 4,
      gradientOpacity: { start: 0.3, end: 0.05 },
    }))
  ), [netSplitChartData, splitSeriesConfig]);

  const netSplitValues = useMemo(
    () => netSplitChartData.flatMap(point => [point.op, point.gm, point.fd]),
    [netSplitChartData]
  );
  const splitRawMaxValue = Math.max(...netSplitValues, 100);
  const splitMinValue = Math.min(...netSplitValues, 0);
  const splitYAxisConfig = getYAxisConfig(splitRawMaxValue);
  const splitMaxValue = splitYAxisConfig.max;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={[theme.backgroundGradientStart, theme.backgroundGradientEnd]}
        style={StyleSheet.absoluteFill}
      />
      {settings.laserBackground && (
        <LaserBackground isDarkMode={settings.darkMode} colorPalette={settings.backgroundColorPalette} intensity={settings.backgroundIntensity} />
      )}
      
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
        >
          <View style={[styles.welcomeCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.welcomeText, { color: theme.text, fontSize: welcomeFontSize }]} numberOfLines={1} adjustsFontSizeToFit>
              Welcome to MY Food Cart
            </Text>
          </View>

          <View style={styles.row}>
            <View style={[styles.dateCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <Text style={[styles.dateLabel, { color: theme.textSecondary }]}>Date</Text>
              <Text style={[styles.dateText, { color: theme.text }]}>{formatDate(new Date())}</Text>
              
              <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 16 }]}>Previous Weeks</Text>
              <View style={styles.weeksContainer}>
                {weeks.map((week, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.weekButton,
                      { borderColor: theme.cardBorder },
                      selectedWeek === index && { backgroundColor: theme.primary + '30', borderColor: theme.primary },
                    ]}
                    onPress={() => setSelectedWeek(index)}
                  >
                    <Text style={[
                      styles.weekText,
                      { color: selectedWeek === index ? theme.primary : theme.textSecondary },
                    ]}>
                      {week.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.chartCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={styles.overviewHeader}>
                <View style={styles.tabRow}>
                  <TouchableOpacity
                    style={[
                      styles.tabButton,
                      isSmallScreen && styles.tabButtonSmall,
                      { borderColor: theme.cardBorder },
                      overviewTab === 'overview' && { backgroundColor: theme.primary + '20', borderColor: theme.primary },
                    ]}
                    onPress={() => setOverviewTab('overview')}
                  >
                    <Text
                      style={[
                        styles.tabLabel,
                        isSmallScreen && styles.tabLabelSmall,
                        { color: overviewTab === 'overview' ? theme.primary : theme.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      Overview
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.tabButton,
                      isSmallScreen && styles.tabButtonSmall,
                      { borderColor: theme.cardBorder },
                      overviewTab === 'netSplit' && { backgroundColor: theme.primary + '20', borderColor: theme.primary },
                    ]}
                    onPress={() => setOverviewTab('netSplit')}
                  >
                    <Text
                      style={[
                        styles.tabLabel,
                        isSmallScreen && styles.tabLabelSmall,
                        { color: overviewTab === 'netSplit' ? theme.primary : theme.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      Net Split
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.overviewRefreshButton}
                  onPress={handleOverviewRefresh}
                  disabled={isOverviewRefreshing}
                >
                  {isOverviewRefreshing ? (
                    <ActivityIndicator size="small" color={theme.textMuted} />
                  ) : (
                    <RefreshCw color={theme.textMuted} size={16} />
                  )}
                </TouchableOpacity>
              </View>
              
              {overviewTab === 'overview' ? (
                <>
                  <View style={styles.weekTotalsRow}>
                    <View style={[styles.weekTotalCard, { backgroundColor: theme.chartLine + '15' }]}> 
                      <Text style={[styles.weekTotalLabel, { color: theme.textSecondary }]}>Sales</Text>
                      <Text style={[styles.weekTotalValue, { color: theme.chartLine }]}>
                        ₱{weekTotals.sales.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                    <View style={[styles.weekTotalCard, { backgroundColor: theme.error + '15' }]}> 
                      <Text style={[styles.weekTotalLabel, { color: theme.textSecondary }]}>Expenses</Text>
                      <Text style={[styles.weekTotalValue, { color: theme.error }]}>
                        ₱{weekTotals.expenses.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.chartLegend}>
                    <TouchableOpacity 
                      style={[
                        styles.legendToggle,
                        { borderColor: showSales ? theme.chartLine : theme.cardBorder },
                        showSales && { backgroundColor: theme.chartLine + '20' }
                      ]}
                      onPress={() => setShowSales(!showSales)}
                    >
                      <View style={[styles.legendDot, { backgroundColor: theme.chartLine, opacity: showSales ? 1 : 0.4 }]} />
                      <Text style={[styles.legendText, { color: showSales ? theme.chartLine : theme.textMuted }]}>Sales</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[
                        styles.legendToggle,
                        { borderColor: showExpenses ? theme.error : theme.cardBorder },
                        showExpenses && { backgroundColor: theme.error + '20' }
                      ]}
                      onPress={() => setShowExpenses(!showExpenses)}
                    >
                      <View style={[styles.legendDot, { backgroundColor: theme.error, opacity: showExpenses ? 1 : 0.4 }]} />
                      <Text style={[styles.legendText, { color: showExpenses ? theme.error : theme.textMuted }]}>Expenses</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.chartContainer}>
                    <WeeklyLineChart
                      data={chartData}
                      series={overviewSeries}
                      chartHeight={chartHeight}
                      chartWidth={chartWidth}
                      maxValue={maxValue}
                      minValue={0}
                    />
                  </View>
                  
                  <View style={styles.xAxis}>
                    {chartData.map((point, index) => (
                      <Text key={index} style={[styles.xAxisLabel, { color: theme.textMuted }]}>
                        {point.day}
                      </Text>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.weekTotalsRow}>
                    {showSplitOp && (
                      <View style={[styles.weekTotalCard, { backgroundColor: theme.success + '15' }]}> 
                        <Text style={[styles.weekTotalLabel, { color: theme.textSecondary }]}>OP</Text>
                        <Text style={[styles.weekTotalValue, { color: theme.success }]}>
                          ₱{visibleNetSplitTotals.op.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      </View>
                    )}
                    {showSplitGm && (
                      <View style={[styles.weekTotalCard, { backgroundColor: theme.primary + '15' }]}> 
                        <Text style={[styles.weekTotalLabel, { color: theme.textSecondary }]}>GM</Text>
                        <Text style={[styles.weekTotalValue, { color: theme.primary }]}>
                          ₱{visibleNetSplitTotals.gm.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      </View>
                    )}
                    {showSplitFd && (
                      <View style={[styles.weekTotalCard, { backgroundColor: theme.warning + '15' }]}> 
                        <Text style={[styles.weekTotalLabel, { color: theme.textSecondary }]}>FD</Text>
                        <Text style={[styles.weekTotalValue, { color: theme.warning }]}>
                          ₱{visibleNetSplitTotals.fd.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.chartLegend}>
                    {splitSeriesConfig.map(series => (
                      <TouchableOpacity
                        key={series.key}
                        style={[
                          styles.legendToggle,
                          { borderColor: series.enabled ? series.color : theme.cardBorder },
                          series.enabled && { backgroundColor: series.color + '20' },
                        ]}
                        onPress={() => toggleSplitSeries(series.key)}
                      >
                        <View style={[styles.legendDot, { backgroundColor: series.color, opacity: series.enabled ? 1 : 0.4 }]} />
                        <Text style={[styles.legendText, { color: series.enabled ? series.color : theme.textMuted }]}>
                          {series.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.chartContainer}>
                    <WeeklyLineChart
                      data={netSplitChartData}
                      series={netSplitSeries}
                      chartHeight={chartHeight}
                      chartWidth={chartWidth}
                      maxValue={splitMaxValue}
                      minValue={splitMinValue}
                    />
                  </View>

                  <View style={styles.xAxis}>
                    {netSplitChartData.map((point, index) => (
                      <Text key={index} style={[styles.xAxisLabel, { color: theme.textMuted }]}>
                        {point.day}
                      </Text>
                    ))}
                  </View>
                </>
              )}
            </View>
          </View>

          <View style={[styles.updatesCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Latest Updates</Text>
            
            <View style={styles.updatesGrid}>
              {activities.slice(0, 4).map((activity) => (
                <View
                  key={activity.id}
                  style={[styles.updateItem, { backgroundColor: theme.cardHighlight, borderColor: theme.cardBorder }]}
                >
                  <View style={[styles.updateIcon, { backgroundColor: theme.primary + '20' }]}>
                    {getActivityIcon(activity.type, theme.primary)}
                  </View>
                  <View style={styles.updateContent}>
                    <Text style={[styles.updateTitle, { color: theme.text }]} numberOfLines={1}>
                      {activity.description}
                    </Text>
                    {canViewAuthor && (
                      <Text style={[styles.updateAuthor, { color: theme.textSecondary }]} numberOfLines={1}>
                        Posted by: {getAuthorDisplayName(activity.userId)}
                      </Text>
                    )}
                    <Text style={[styles.updateTime, { color: theme.textMuted }]}>
                      {getRelativeTime(activity.createdAt)}
                    </Text>
                  </View>
                </View>
              ))}
              
              {activities.length === 0 && (
                <View style={styles.emptyUpdates}>
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                    No recent updates
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  welcomeCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '700' as const,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  dateCard: {
    flex: 1,
    minWidth: 200,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  dateLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 12,
  },
  weeksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  weekButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 70,
    alignItems: 'center',
  },
  weekText: {
    fontSize: 11,
    textAlign: 'center',
  },
  chartCard: {
    flex: 2,
    minWidth: 300,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabRow: {
    flexDirection: 'row',
    flex: 1,
    gap: 8,
    marginRight: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonSmall: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  tabLabelSmall: {
    fontSize: 10,
  },
  overviewRefreshButton: {
    padding: 4,
  },
  chartContainer: {
    alignItems: 'center',
  },
  chart: {
    marginLeft: 0,
  },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 24,
  },
  xAxisLabel: {
    fontSize: 10,
    width: 30,
    textAlign: 'center',
  },
  chartLegend: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
  updatesCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  updatesGrid: {
    gap: 12,
  },
  updateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  updateIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  updateContent: {
    flex: 1,
  },
  updateTitle: {
    fontSize: 14,
    fontWeight: '500' as const,
    marginBottom: 2,
  },
  updateTime: {
    fontSize: 12,
  },
  updateAuthor: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyUpdates: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  weekTotalsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  weekTotalCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  weekTotalLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  weekTotalValue: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
});
