import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { formatDate, ROLE_DISPLAY_NAMES, UserRole } from '@/types';
import { getWeeklySalesTotals, getWeeklyExpenseTotals, getActivities, getUsers } from '@/services/database';
import { getDayKeysForWeek, getWeekdayLabels, getWeekRange, getWeekStart, toLocalDayKey } from '@/services/dateUtils';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText, Rect, G } from 'react-native-svg';
import LaserBackground from '@/components/LaserBackground';
import { useSync } from '@/contexts/SyncContext';

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

function formatCompactNumber(value: number): string {
  if (value === 0) return '0';
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000) {
    const formatted = absValue / 1_000_000;
    const withDecimal = formatted < 10 && absValue % 1_000_000 !== 0;
    return `${value < 0 ? '-' : ''}${withDecimal ? formatted.toFixed(1) : Math.round(formatted)}M`;
  }
  if (absValue >= 1_000) {
    const formatted = absValue / 1_000;
    const withDecimal = formatted < 10 && absValue % 1_000 !== 0;
    return `${value < 0 ? '-' : ''}${withDecimal ? formatted.toFixed(1) : Math.round(formatted)}k`;
  }
  return `${value}`;
}

const AUTHOR_VISIBLE_ROLES: UserRole[] = ['general_manager', 'operation_manager', 'developer'];

export default function HomeScreen() {
  const router = useRouter();
  const { settings, user: currentUser, updateSettings } = useAuth();
  const { lastSyncTime } = useSync();
  const theme = settings.darkMode ? Colors.dark : Colors.light;
  const chartLabelColor = settings.darkMode ? '#FFFFFF' : '#000000';

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

  const { width: screenWidth } = useWindowDimensions();
  
  const welcomeFontSize = screenWidth < 360 ? 18 : screenWidth < 400 ? 20 : 24;

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

  const weekStart = useMemo(
    () => getWeekStart(currentWeek.start, weekStartsOn),
    [currentWeek.start, weekStartsOn]
  );
  const weekDayKeys = useMemo(() => getDayKeysForWeek(weekStart), [weekStart]);
  const weekDayLabels = useMemo(() => {
    const shortLabels: Record<string, string> = {
      Sun: 'S',
      Mon: 'M',
      Tue: 'T',
      Wed: 'W',
      Thu: 'T',
      Fri: 'F',
      Sat: 'S',
    };
    return getWeekdayLabels(weekStartsOn).map(label => shortLabels[label] ?? label);
  }, [weekStartsOn]);

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
  const chartTopPadding = 20;
  const chartBottomPadding = 10;
  const chartWidth = width - 80;
  const chartXOffset = 10;
  const chartSvgWidth = chartWidth + 48 + chartXOffset;
  const chartSvgHeight = chartHeight + chartTopPadding + chartBottomPadding;
  const baseDaySpacing = Math.round(chartWidth / 6);
  const dayPointSpacing = Math.round(baseDaySpacing * 0.92);
  const stepX = dayPointSpacing;
  const dayLabelSpacingMin = 18;
  const dayLabelSpacingMax = 90;
  const dayLabelSpacingStep = 2;
  const normalizeDayLabelSpacing = useCallback(
    (value: number) => {
      const clamped = Math.min(dayLabelSpacingMax, Math.max(dayLabelSpacingMin, value));
      const rounded = Math.round(clamped / dayLabelSpacingStep) * dayLabelSpacingStep;
      return Math.min(dayLabelSpacingMax, Math.max(dayLabelSpacingMin, rounded));
    },
    [dayLabelSpacingMax, dayLabelSpacingMin, dayLabelSpacingStep]
  );
  const defaultDayLabelSpacing = useMemo(() => {
    return normalizeDayLabelSpacing(dayPointSpacing);
  }, [dayPointSpacing, normalizeDayLabelSpacing]);
  const [dayLabelSpacing, setDayLabelSpacing] = useState<number>(
    normalizeDayLabelSpacing(settings.weeklyDayLabelSpacing ?? defaultDayLabelSpacing)
  );
  const scaleY = useCallback(
    (value: number) => chartTopPadding + chartHeight - (value / maxValue) * chartHeight,
    [chartHeight, chartTopPadding, maxValue]
  );

  useEffect(() => {
    const nextSpacing = normalizeDayLabelSpacing(
      settings.weeklyDayLabelSpacing ?? defaultDayLabelSpacing
    );
    setDayLabelSpacing(prev => (prev === nextSpacing ? prev : nextSpacing));
  }, [defaultDayLabelSpacing, normalizeDayLabelSpacing, settings.weeklyDayLabelSpacing]);

  const updateDayLabelSpacing = useCallback(
    (value: number) => {
      const normalized = normalizeDayLabelSpacing(value);
      setDayLabelSpacing(normalized);
      if (settings.weeklyDayLabelSpacing !== normalized) {
        updateSettings({ weeklyDayLabelSpacing: normalized });
      }
    },
    [normalizeDayLabelSpacing, settings.weeklyDayLabelSpacing, updateSettings]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchSales(), refetchExpenses(), refetchActivities(), refetchUsers()]);
    setRefreshing(false);
  }, [refetchSales, refetchExpenses, refetchActivities, refetchUsers]);

  const refreshOverview = useCallback(async () => {
    setIsOverviewRefreshing(true);
    try {
      await Promise.all([refetchSales(), refetchExpenses()]);
    } finally {
      setIsOverviewRefreshing(false);
    }
  }, [refetchSales, refetchExpenses]);

  useFocusEffect(
    useCallback(() => {
      refreshOverview();
    }, [refreshOverview])
  );

  useEffect(() => {
    if (lastSyncTime) {
      refreshOverview();
    }
  }, [lastSyncTime, refreshOverview]);

  const pathData = chartData.map((point, index) => {
    const x = index * stepX;
    const y = scaleY(point.sales);
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const areaPath = `${pathData} L ${(chartData.length - 1) * stepX} ${chartTopPadding + chartHeight} L 0 ${chartTopPadding + chartHeight} Z`;

  const expensePathData = chartData.map((point, index) => {
    const x = index * stepX;
    const y = scaleY(point.expenses);
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const expenseAreaPath = `${expensePathData} L ${(chartData.length - 1) * stepX} ${chartTopPadding + chartHeight} L 0 ${chartTopPadding + chartHeight} Z`;

  const labelData = useMemo(() => {
    const labelOffset = 10;
    const collisionThreshold = 14;
    const collisionOffset = 18;
    const collisionSideOffset = 6;
    const labelHeight = 12;
    const labelPaddingX = 3;
    const charWidth = 5.4;

    return chartData.map((point, index) => {
      const x = index * stepX;
      const ySales = scaleY(point.sales);
      const yExpenses = scaleY(point.expenses);
      const salesLabel = formatCompactNumber(point.sales);
      const expenseLabel = formatCompactNumber(point.expenses);
      const salesWidth = salesLabel.length * charWidth;
      const expenseWidth = expenseLabel.length * charWidth;
      const minSalesX = salesWidth / 2 + labelPaddingX;
      const minExpenseX = expenseWidth / 2 + labelPaddingX;
      const maxSalesX = chartSvgWidth - minSalesX;
      const maxExpenseX = chartSvgWidth - minExpenseX;

      let salesOffset = labelOffset;
      let expenseOffset = labelOffset;
      let salesX = x;
      let expenseX = x;

      if (Math.abs(ySales - yExpenses) < collisionThreshold) {
        if (ySales <= yExpenses) {
          salesOffset = collisionOffset;
          expenseOffset = labelOffset - 2;
          salesX = x - collisionSideOffset;
          expenseX = x + collisionSideOffset;
        } else {
          expenseOffset = collisionOffset;
          salesOffset = labelOffset - 2;
          expenseX = x - collisionSideOffset;
          salesX = x + collisionSideOffset;
        }
      }

      const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
      const salesLabelX = clamp(salesX, minSalesX, maxSalesX);
      const expenseLabelX = clamp(expenseX, minExpenseX, maxExpenseX);
      const salesLabelY = Math.max(4 + labelHeight / 2, ySales - salesOffset);
      const expenseLabelY = Math.max(4 + labelHeight / 2, yExpenses - expenseOffset);

      return {
        x,
        ySales,
        yExpenses,
        salesLabel,
        expenseLabel,
        salesLabelX,
        salesLabelY,
        expenseLabelX,
        expenseLabelY,
        salesLabelWidth: salesWidth,
        expenseLabelWidth: expenseWidth,
        labelHeight,
        labelPaddingX,
      };
    });
  }, [chartData, chartSvgWidth, scaleY, stepX]);

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
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Weekly Overview</Text>
                <TouchableOpacity
                  style={[styles.refreshButton, { backgroundColor: theme.cardHighlight, borderColor: theme.cardBorder }]}
                  onPress={refreshOverview}
                  disabled={isOverviewRefreshing}
                >
                  {isOverviewRefreshing ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <RefreshCw color={theme.primary} size={16} />
                  )}
                </TouchableOpacity>
              </View>
              
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
                <Svg width={chartSvgWidth} height={chartSvgHeight} style={styles.chart}>
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
                  
                  <G transform={`translate(${chartXOffset}, 0)`}>
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
                        cx={index * stepX}
                        cy={scaleY(point.sales)}
                        r={4}
                        fill={theme.chartLine}
                      />
                    ))}
                    {showExpenses && chartData.map((point, index) => (
                      <Circle
                        key={`expense-${index}`}
                        cx={index * stepX}
                        cy={scaleY(point.expenses)}
                        r={3}
                        fill={theme.error}
                      />
                    ))}
                    {showSales && labelData.map((label, index) => (
                      <React.Fragment key={`sales-label-${index}`}>
                        <Rect
                          x={label.salesLabelX - label.salesLabelWidth / 2 - label.labelPaddingX}
                          y={label.salesLabelY - label.labelHeight / 2}
                          width={label.salesLabelWidth + label.labelPaddingX * 2}
                          height={label.labelHeight}
                          rx={3}
                          fill={theme.card}
                          opacity={0.85}
                        />
                        <SvgText
                          x={label.salesLabelX}
                          y={label.salesLabelY}
                          fontSize={9}
                          textAnchor="middle"
                          alignmentBaseline="middle"
                          fill={chartLabelColor}
                        >
                          {label.salesLabel}
                        </SvgText>
                      </React.Fragment>
                    ))}
                    {showExpenses && labelData.map((label, index) => (
                      <React.Fragment key={`expense-label-${index}`}>
                        <Rect
                          x={label.expenseLabelX - label.expenseLabelWidth / 2 - label.labelPaddingX}
                          y={label.expenseLabelY - label.labelHeight / 2}
                          width={label.expenseLabelWidth + label.labelPaddingX * 2}
                          height={label.labelHeight}
                          rx={3}
                          fill={theme.card}
                          opacity={0.85}
                        />
                        <SvgText
                          x={label.expenseLabelX}
                          y={label.expenseLabelY}
                          fontSize={9}
                          textAnchor="middle"
                          alignmentBaseline="middle"
                          fill={chartLabelColor}
                        >
                          {label.expenseLabel}
                        </SvgText>
                      </React.Fragment>
                    ))}
                  </G>
                </Svg>
              </View>
              
              <View style={styles.stretchControls}>
                <Text style={[styles.stretchLabel, { color: theme.textSecondary }]}>Stretch Days</Text>
                <View style={styles.stretchButtons}>
                  <TouchableOpacity
                    style={[
                      styles.stretchButton,
                      { borderColor: theme.cardBorder, backgroundColor: theme.cardHighlight },
                      dayLabelSpacing <= dayLabelSpacingMin && styles.stretchButtonDisabled,
                    ]}
                    onPress={() => updateDayLabelSpacing(dayLabelSpacing - dayLabelSpacingStep)}
                    disabled={dayLabelSpacing <= dayLabelSpacingMin}
                  >
                    <Text style={[styles.stretchButtonText, { color: theme.text }]}>-</Text>
                  </TouchableOpacity>
                  <Text style={[styles.stretchValue, { color: theme.text }]}>{dayLabelSpacing}</Text>
                  <TouchableOpacity
                    style={[
                      styles.stretchButton,
                      { borderColor: theme.cardBorder, backgroundColor: theme.cardHighlight },
                      dayLabelSpacing >= dayLabelSpacingMax && styles.stretchButtonDisabled,
                    ]}
                    onPress={() => updateDayLabelSpacing(dayLabelSpacing + dayLabelSpacingStep)}
                    disabled={dayLabelSpacing >= dayLabelSpacingMax}
                  >
                    <Text style={[styles.stretchButtonText, { color: theme.text }]}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.xAxisContainer}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.xAxisContent}
                >
                  {chartData.map((point, index) => (
                    <View key={index} style={[styles.xAxisLabelWrapper, { width: dayLabelSpacing }]}>
                      <Text style={[styles.xAxisLabel, { color: theme.textMuted }]}>
                        {point.day}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
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
    minWidth: 60,
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
    marginBottom: 12,
  },
  refreshButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartContainer: {
    alignItems: 'center',
  },
  chart: {
    marginLeft: 24,
  },
  stretchControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  stretchLabel: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
  stretchButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stretchButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stretchButtonDisabled: {
    opacity: 0.5,
  },
  stretchButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  stretchValue: {
    fontSize: 12,
    fontWeight: '600' as const,
    minWidth: 32,
    textAlign: 'center',
  },
  xAxisContainer: {
    marginTop: 8,
    overflow: 'hidden',
  },
  xAxisContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 1,
    paddingRight: 12,
  },
  xAxisLabelWrapper: {
    alignItems: 'center',
  },
  xAxisLabel: {
    fontSize: 10,
    textAlign: 'center',
  },
  chartLegend: {
    flexDirection: 'row',
    gap: 12,
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
    paddingHorizontal: 8,
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
