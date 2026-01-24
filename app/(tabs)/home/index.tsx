import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Package, ShoppingCart, User, Settings, RefreshCw } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

import { useRouter } from 'expo-router';
import { formatDate, ROLE_DISPLAY_NAMES, UserRole } from '@/types';
import { getSalesTotalsForRange, getExpenseTotalsForRange, getActivities, getUsers } from '@/services/database';
import { getDayKeysForRange, getDayKeysForWeek, getWeekdayLabels, getWeekRange, getWeekStart, parseLocalDateString, toLocalDayKey } from '@/services/dateUtils';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import LaserBackground from '@/components/LaserBackground';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSync } from '@/contexts/SyncContext';
import { isSupabaseConfigured } from '@/services/supabase';


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

function formatRangeDisplay(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endDay = end.getDate();
  if (sameMonth) {
    return `${startMonth} ${startDay} – ${endDay}`;
  }
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}`;
}

function formatRangeDayLabel(dateKey: string): string {
  const date = parseLocalDateString(dateKey);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

export default function HomeScreen() {
  const router = useRouter();
  const { settings, user: currentUser } = useAuth();
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
  const [selectedMode, setSelectedMode] = useState<'week' | 'custom'>('week');
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date }>({
    start: new Date(),
    end: new Date(),
  });
  const [isRangeModalVisible, setIsRangeModalVisible] = useState(false);
  const [rangeDraft, setRangeDraft] = useState<{ start: Date; end: Date }>({
    start: new Date(),
    end: new Date(),
  });
  const [rangeError, setRangeError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [overviewRefreshing, setOverviewRefreshing] = useState(false);
  const [showSales, setShowSales] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);

  const { width: screenWidth } = useWindowDimensions();
  const { triggerSync, isOnline } = useSync();
  
  const welcomeFontSize = screenWidth < 360 ? 18 : screenWidth < 400 ? 20 : 24;

  const weekStartsOn = 0;

  const weeks = useMemo(() => {
    return [0, 1, 2, 3].map(i => {
      const { start, end } = getWeekRange(i, weekStartsOn);
      return { start, end, label: formatWeekRange(start, end) };
    });
  }, [weekStartsOn]);

  const currentWeek = weeks[selectedWeek];
  const selectedRange = useMemo(() => {
    if (selectedMode === 'custom') {
      return customRange;
    }
    return currentWeek;
  }, [currentWeek, customRange, selectedMode]);
  const startDateStr = toLocalDayKey(selectedRange.start);
  const endDateStr = toLocalDayKey(selectedRange.end);



  const { data: salesTotalsMap = {}, refetch: refetchSales } = useQuery({
    queryKey: ['rangeSalesTotals', startDateStr, endDateStr],
    queryFn: () => getSalesTotalsForRange(startDateStr, endDateStr),
  });

  const { data: expensesTotalsMap = {}, refetch: refetchExpenses } = useQuery({
    queryKey: ['rangeExpenseTotals', startDateStr, endDateStr],
    queryFn: () => getExpenseTotalsForRange(startDateStr, endDateStr),
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

  const getAuthorDisplayName = useCallback((userId: string): string => {
    const author = userMap.get(userId);
    if (!author) return 'Unknown';
    if (author.name && author.name.trim() !== '') {
      return author.name;
    }
    return ROLE_DISPLAY_NAMES[author.role] || 'Unknown';
  }, [userMap]);

  const canViewAuthor = currentUser && AUTHOR_VISIBLE_ROLES.includes(currentUser.role);

  const periodDayKeys = useMemo(() => {
    if (selectedMode === 'custom') {
      return getDayKeysForRange(selectedRange.start, selectedRange.end);
    }
    const weekStart = getWeekStart(currentWeek.start, weekStartsOn);
    return getDayKeysForWeek(weekStart);
  }, [currentWeek.start, selectedMode, selectedRange.end, selectedRange.start, weekStartsOn]);
  const periodDayLabels = useMemo(() => {
    if (selectedMode === 'custom') {
      return periodDayKeys.map(formatRangeDayLabel);
    }
    return getWeekdayLabels(weekStartsOn);
  }, [periodDayKeys, selectedMode, weekStartsOn]);

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_DEBUG_WEEKLY_CHART === 'true') {
      const labelCount = periodDayLabels.length;
      const keyCount = periodDayKeys.length;
      if (labelCount !== keyCount) {
        console.warn('Weekly chart labels/day keys mismatch', { labelCount, keyCount });
      } else {
        console.log('Weekly chart alignment check', { periodDayLabels, periodDayKeys });
      }
    }
  }, [periodDayKeys, periodDayLabels]);

  const salesByDay = useMemo(() => {
    return new Map(Object.entries(salesTotalsMap).map(([key, value]) => [key, Number(value) || 0]));
  }, [salesTotalsMap]);

  const expensesByDay = useMemo(() => {
    return new Map(Object.entries(expensesTotalsMap).map(([key, value]) => [key, Number(value) || 0]));
  }, [expensesTotalsMap]);

  const salesSeries = useMemo(
    () => periodDayKeys.map(key => salesByDay.get(key) ?? 0),
    [salesByDay, periodDayKeys]
  );

  const expensesSeries = useMemo(
    () => periodDayKeys.map(key => expensesByDay.get(key) ?? 0),
    [expensesByDay, periodDayKeys]
  );

  const chartData = useMemo(() => {
    return periodDayKeys.map((dateStr, index) => {
      const day = periodDayLabels[index] ?? '';
      const daySales = salesSeries[index] ?? 0;
      const dayExpenses = expensesSeries[index] ?? 0;

      return { day, sales: daySales, expenses: dayExpenses, dateStr };
    });
  }, [expensesSeries, salesSeries, periodDayKeys, periodDayLabels]);

  const periodTotals = useMemo(() => {
    const salesTotal = salesSeries.reduce((sum, val) => sum + val, 0);
    const expensesTotal = expensesSeries.reduce((sum, val) => sum + val, 0);
    console.log(`Totals (${startDateStr} to ${endDateStr}): Sales=₱${salesTotal}, Expenses=₱${expensesTotal}`);
    return { sales: salesTotal, expenses: expensesTotal, net: salesTotal - expensesTotal };
  }, [expensesSeries, salesSeries, startDateStr, endDateStr]);

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
  const chartStep = 48;
  const chartDayCount = Math.max(chartData.length, 1);
  const chartContentWidth = Math.max(screenWidth - 80, chartDayCount * chartStep);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchSales(), refetchExpenses(), refetchActivities(), refetchUsers()]);
    setRefreshing(false);
  }, [refetchSales, refetchExpenses, refetchActivities, refetchUsers]);

  const pathData = chartData.map((point, index) => {
    const x = index * chartStep + chartStep / 2;
    const y = chartHeight - (point.sales / maxValue) * chartHeight;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const areaPath = `${pathData} L ${chartData.length * chartStep - chartStep / 2} ${chartHeight} L ${chartStep / 2} ${chartHeight} Z`;

  const expensePathData = chartData.map((point, index) => {
    const x = index * chartStep + chartStep / 2;
    const y = chartHeight - (point.expenses / maxValue) * chartHeight;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const expenseAreaPath = `${expensePathData} L ${chartData.length * chartStep - chartStep / 2} ${chartHeight} L ${chartStep / 2} ${chartHeight} Z`;

  const handleRangeConfirm = useCallback(() => {
    if (rangeDraft.start > rangeDraft.end) {
      setRangeError('From date must be on or before To date.');
      return;
    }
    const normalizedStart = new Date(rangeDraft.start);
    normalizedStart.setHours(0, 0, 0, 0);
    const normalizedEnd = new Date(rangeDraft.end);
    normalizedEnd.setHours(0, 0, 0, 0);
    setCustomRange({ start: normalizedStart, end: normalizedEnd });
    setIsRangeModalVisible(false);
    setRangeError('');
  }, [rangeDraft]);

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
              <View style={styles.selectedRange}>
                <Text style={[styles.rangeLabel, { color: theme.textSecondary }]}>Selected range</Text>
                <Text style={[styles.rangeText, { color: theme.text }]}>
                  {formatRangeDisplay(selectedRange.start, selectedRange.end)}
                </Text>
              </View>
              
              <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 16 }]}>Previous Weeks</Text>
              <View style={styles.weeksContainer}>
                {weeks.map((week, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.weekButton,
                      { borderColor: theme.cardBorder },
                      selectedMode === 'week' &&
                        selectedWeek === index && { backgroundColor: theme.primary + '30', borderColor: theme.primary },
                    ]}
                    onPress={() => {
                      setSelectedMode('week');
                      setSelectedWeek(index);
                    }}
                  >
                    <Text style={[
                      styles.weekText,
                      { color: selectedMode === 'week' && selectedWeek === index ? theme.primary : theme.textSecondary },
                    ]}>
                      {week.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[
                    styles.weekButton,
                    { borderColor: theme.cardBorder },
                    selectedMode === 'custom' && { backgroundColor: theme.primary + '30', borderColor: theme.primary },
                  ]}
                  onPress={() => {
                    setSelectedMode('custom');
                    setRangeDraft(customRange);
                    setRangeError('');
                    setIsRangeModalVisible(true);
                  }}
                >
                  <Text style={[
                    styles.weekText,
                    { color: selectedMode === 'custom' ? theme.primary : theme.textSecondary },
                  ]}>
                    Custom
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.chartCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={styles.chartHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Overview</Text>
                <TouchableOpacity
                  style={[styles.refreshIconButton, { borderColor: theme.cardBorder }]}
                  onPress={async () => {
                    if (overviewRefreshing) return;
                    setOverviewRefreshing(true);
                    await Promise.all([refetchSales(), refetchExpenses()]);
                    if (isOnline && isSupabaseConfigured()) {
                      await triggerSync();
                      await Promise.all([refetchSales(), refetchExpenses()]);
                    }
                    setOverviewRefreshing(false);
                  }}
                  disabled={overviewRefreshing}
                >
                  {overviewRefreshing ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <RefreshCw color={theme.textSecondary} size={16} />
                  )}
                </TouchableOpacity>
              </View>
              
              <View style={styles.weekTotalsRow}>
                <View style={[styles.weekTotalCard, { backgroundColor: theme.chartLine + '15' }]}>
                  <Text style={[styles.weekTotalLabel, { color: theme.textSecondary }]}>Sales</Text>
                  <Text style={[styles.weekTotalValue, { color: theme.chartLine }]}>
                    ₱{periodTotals.sales.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={[styles.weekTotalCard, { backgroundColor: theme.error + '15' }]}>
                  <Text style={[styles.weekTotalLabel, { color: theme.textSecondary }]}>Expenses</Text>
                  <Text style={[styles.weekTotalValue, { color: theme.error }]}>
                    ₱{periodTotals.expenses.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.chartScrollContent, { width: chartContentWidth }]}
                >
                  <Svg width={chartContentWidth} height={chartHeight + 30} style={styles.chart}>
                    <Defs>
                      <SvgLinearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={theme.chartLine} stopOpacity="0.3" />
                        <Stop offset="1" stopColor={theme.chartLine} stopOpacity="0.05" />
                      </SvgLinearGradient>
                      <SvgLinearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={theme.error} stopOpacity="0.2" />
                        <Stop offset="1" stopColor={theme.error} stopOpacity="0.02" />
                      </SvgLinearGradient>
                    </Defs>
                    
                    {showSales && (
                      <>
                        <Path d={areaPath} fill="url(#areaGradient)" />
                        <Path d={pathData} stroke={theme.chartLine} strokeWidth={2} fill="none" />
                      </>
                    )}
                    
                    {showExpenses && (
                      <>
                        <Path d={expenseAreaPath} fill="url(#expenseGradient)" />
                        <Path d={expensePathData} stroke={theme.error} strokeWidth={2} fill="none" strokeDasharray="4,4" />
                      </>
                    )}
                    
                    {showSales && chartData.map((point, index) => (
                      <Circle
                        key={`sales-${index}`}
                        cx={index * chartStep + chartStep / 2}
                        cy={chartHeight - (point.sales / maxValue) * chartHeight}
                        r={4}
                        fill={theme.chartLine}
                      />
                    ))}
                    {showExpenses && chartData.map((point, index) => (
                      <Circle
                        key={`expense-${index}`}
                        cx={index * chartStep + chartStep / 2}
                        cy={chartHeight - (point.expenses / maxValue) * chartHeight}
                        r={3}
                        fill={theme.error}
                      />
                    ))}
                  </Svg>
                </ScrollView>
              </View>
              
              <View style={styles.xAxis}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.xAxisContent, { width: chartContentWidth }]}
                >
                  {chartData.map((point, index) => (
                    <View key={index} style={[styles.xAxisLabelContainer, { width: chartStep }]}>
                      <Text style={[styles.xAxisLabel, { color: theme.textMuted }]} numberOfLines={1}>
                        {point.day}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>

          <Modal
            visible={isRangeModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => {
              setIsRangeModalVisible(false);
              setRangeError('');
            }}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.rangeModal, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Pick custom range</Text>

                <View style={styles.rangePickerRow}>
                  <Text style={[styles.rangePickerLabel, { color: theme.textSecondary }]}>From</Text>
                  <DateTimePicker
                    value={rangeDraft.start}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, date) => {
                      if (date) {
                        setRangeDraft(prev => ({ ...prev, start: date }));
                      }
                    }}
                    maximumDate={rangeDraft.end}
                  />
                </View>

                <View style={styles.rangePickerRow}>
                  <Text style={[styles.rangePickerLabel, { color: theme.textSecondary }]}>To</Text>
                  <DateTimePicker
                    value={rangeDraft.end}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, date) => {
                      if (date) {
                        setRangeDraft(prev => ({ ...prev, end: date }));
                      }
                    }}
                    minimumDate={rangeDraft.start}
                  />
                </View>

                {rangeError ? (
                  <Text style={[styles.rangeError, { color: theme.error }]}>{rangeError}</Text>
                ) : null}

                <View style={styles.rangeActions}>
                  <TouchableOpacity
                    style={[styles.rangeActionButton, { borderColor: theme.cardBorder }]}
                    onPress={() => {
                      setIsRangeModalVisible(false);
                      setRangeError('');
                    }}
                  >
                    <Text style={[styles.rangeActionText, { color: theme.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rangeActionButton, { borderColor: theme.primary, backgroundColor: theme.primary + '20' }]}
                    onPress={handleRangeConfirm}
                  >
                    <Text style={[styles.rangeActionText, { color: theme.primary }]}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

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
  selectedRange: {
    marginTop: 10,
  },
  rangeLabel: {
    fontSize: 12,
  },
  rangeText: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginTop: 4,
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
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  refreshIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartContainer: {
    alignItems: 'center',
  },
  chart: {
    marginLeft: 0,
  },
  chartScrollContent: {
    paddingHorizontal: 12,
  },
  xAxis: {
    marginTop: 8,
  },
  xAxisContent: {
    paddingHorizontal: 12,
  },
  xAxisLabelContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  xAxisLabel: {
    fontSize: 10,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  rangeModal: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 12,
  },
  rangePickerRow: {
    marginBottom: 12,
  },
  rangePickerLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  rangeError: {
    fontSize: 12,
    marginTop: 4,
  },
  rangeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
  },
  rangeActionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  rangeActionText: {
    fontSize: 13,
    fontWeight: '600' as const,
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
