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
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Package, ShoppingCart, User, Settings, RefreshCw } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { formatCurrency, formatDate, ROLE_DISPLAY_NAMES, UserRole } from '@/types';
import { getWeeklySalesTotals, getWeeklyExpenseTotals, getActivities, getUsers } from '@/services/database';
import { getDayKeysForWeek, getWeekdayLabels, getWeekRange, getWeekStart, toLocalDayKey } from '@/services/dateUtils';
import { calculateNetSalesSplitAmounts } from '@/services/netSalesSplit';
import { buildPdfSummaryHtml } from '@/services/pdf-summary';
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

function getWritablePdfDirectory(): string | null {
  const documentDirectory = FileSystem.documentDirectory;
  const cacheDirectory = FileSystem.cacheDirectory;
  console.log('documentDirectory', documentDirectory);
  console.log('cacheDirectory', cacheDirectory);
  return cacheDirectory ?? documentDirectory ?? null;
}

const AUTHOR_VISIBLE_ROLES: UserRole[] = ['general_manager', 'operation_manager', 'developer'];
const WEEKLY_DAY_LABEL_SPACING_KEY = '@myfoodcart_weekly_day_label_spacing';

export default function HomeScreen() {
  const router = useRouter();
  const { settings, user: currentUser } = useAuth();
  const { lastSyncTime } = useSync();
  const theme = settings.darkMode ? Colors.dark : Colors.light;
  const chartLabelColor = settings.darkMode ? '#FFFFFF' : '#000000';
  const SALES_LABEL_BLUE = '#7DB7FF';
  const EXPENSE_LABEL_RED = '#FF7A7A';
  const omLabelColor = '#63F29A';
  const gmLabelColor = '#C7A6FF';
  const labelBackgroundFill = settings.darkMode
    ? 'rgba(0, 0, 0, 0.35)'
    : 'rgba(255, 255, 255, 0.55)';
  const omColor = '#2ECC71';
  const gmColor = '#9B59B6';
  const fcColor = '#F39C12';

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
  const [showOm, setShowOm] = useState(false);
  const [showGm, setShowGm] = useState(false);
  const [showFc, setShowFc] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [netSalesSplit, setNetSalesSplit] = useState({
    operation: 65,
    general: 25,
    foodCart: 10,
    includeExp: true,
  });

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

  const loadNetSalesSplit = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('netSalesSplit');
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<typeof netSalesSplit>;
      const normalizeValue = (value: unknown, fallback: number) => {
        const parsedValue = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(parsedValue) ? parsedValue : fallback;
      };
      setNetSalesSplit(prev => ({
        operation: normalizeValue(parsed.operation, prev.operation),
        general: normalizeValue(parsed.general, prev.general),
        foodCart: normalizeValue(parsed.foodCart, prev.foodCart),
        includeExp: typeof parsed.includeExp === 'boolean' ? parsed.includeExp : prev.includeExp,
      }));
    } catch (error) {
      console.log('Error loading net sales split:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNetSalesSplit();
    }, [loadNetSalesSplit])
  );

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

  const normalizedSplit = useMemo(() => {
    const normalizePercent = (value: number) => {
      if (!Number.isFinite(value)) return 0;
      if (value <= 0) return 0;
      return value > 1 ? value / 100 : value;
    };
    return {
      operation: normalizePercent(netSalesSplit.operation),
      general: normalizePercent(netSalesSplit.general),
      foodCart: normalizePercent(netSalesSplit.foodCart),
      includeExp: netSalesSplit.includeExp,
    };
  }, [netSalesSplit]);

  const chartData = useMemo(() => {
    return weekDayKeys.map((dateStr, index) => {
      const day = weekDayLabels[index] ?? '';
      const daySales = salesSeries[index] ?? 0;
      const dayExpenses = expensesSeries[index] ?? 0;
      const netSales = normalizedSplit.includeExp ? daySales - dayExpenses : daySales;
      const netBase = Math.max(0, netSales);
      const omAmount = netBase * normalizedSplit.operation;
      const gmAmount = netBase * normalizedSplit.general;
      const fcAmount = netBase * normalizedSplit.foodCart;

      return { day, sales: daySales, expenses: dayExpenses, om: omAmount, gm: gmAmount, fc: fcAmount, dateStr };
    });
  }, [expensesSeries, normalizedSplit, salesSeries, weekDayKeys, weekDayLabels]);

  const weekTotals = useMemo(() => {
    const salesTotal = salesSeries.reduce((sum, val) => sum + val, 0);
    const expensesTotal = expensesSeries.reduce((sum, val) => sum + val, 0);
    console.log(`Week totals (${startDateStr} to ${endDateStr}): Sales=₱${salesTotal}, Expenses=₱${expensesTotal}`);
    return { sales: salesTotal, expenses: expensesTotal, net: salesTotal - expensesTotal };
  }, [expensesSeries, salesSeries, startDateStr, endDateStr]);

  const weeklySplitAmounts = useMemo(
    () =>
      calculateNetSalesSplitAmounts(weekTotals.sales, weekTotals.expenses, {
        operation: netSalesSplit.operation,
        general: netSalesSplit.general,
        foodCart: netSalesSplit.foodCart,
        includeExp: netSalesSplit.includeExp,
      }),
    [netSalesSplit, weekTotals.expenses, weekTotals.sales]
  );

  const updateProgress = useCallback((value: number, message: string) => {
    setProgressValue(value);
    setProgressMessage(message);
  }, []);

  const handleGeneratePdf = useCallback(async () => {
    if (isGeneratingPdf) return;
    if (Platform.OS === 'web') {
      Alert.alert('PDF export not supported', 'PDF export is not supported on web yet.');
      return;
    }

    setIsGeneratingPdf(true);
    setShowProgressModal(true);
    updateProgress(10, 'Collecting data...');

    try {
      const { html, fileName } = await buildPdfSummaryHtml({
        weeks,
        selectedWeekIndex: selectedWeek,
        appName: 'MY Food Cart',
      });

      updateProgress(40, 'Building HTML...');
      updateProgress(70, 'Creating PDF...');
      let tempPdfUri: string;
      try {
        const { uri } = await Print.printToFileAsync({ html });
        tempPdfUri = uri;
      } catch (error) {
        console.log('Error generating PDF summary:', error);
        setShowProgressModal(false);
        setIsGeneratingPdf(false);
        Alert.alert('Export Failed', 'Unable to generate the PDF summary. Please try again.');
        return;
      }

      console.log('tempPdfUri', tempPdfUri);

      const baseDirectory = getWritablePdfDirectory();
      let outputUri: string | null = null;

      if (baseDirectory) {
        outputUri = `${baseDirectory}${fileName}`;
        updateProgress(90, 'Saving file...');
        try {
          await FileSystem.deleteAsync(outputUri, { idempotent: true });
          await FileSystem.copyAsync({ from: tempPdfUri, to: outputUri });
        } catch (error) {
          console.log('Error saving PDF summary:', error);
          outputUri = null;
        }
      }

      const finalUri = outputUri ?? tempPdfUri;
      console.log('finalUri', finalUri);
      updateProgress(100, 'Ready!');
      setShowProgressModal(false);
      setIsGeneratingPdf(false);

      const mailAvailable = await MailComposer.isAvailableAsync();
      const shareAvailable = await Sharing.isAvailableAsync();

      if (!mailAvailable && !shareAvailable) {
        Alert.alert('PDF Summary Ready', `Saved to ${finalUri}`);
        return;
      }

      const buttons = [
        { text: 'Cancel', style: 'cancel' as const },
      ];

      if (mailAvailable) {
        buttons.unshift({
          text: 'Send via Email',
          onPress: () => MailComposer.composeAsync({
            subject: 'MY Food Cart – PDF Summary',
            body: 'Hi! Please find the attached PDF summary report.',
            attachments: [finalUri],
          }),
        });
      }

      if (shareAvailable) {
        buttons.push({
          text: 'Share',
          onPress: () => Sharing.shareAsync(finalUri),
        });
      }

      Alert.alert('PDF Summary Ready', 'Choose how you want to send your PDF summary.', buttons);
    } catch (error) {
      console.log('Unexpected error preparing PDF summary:', error);
      setShowProgressModal(false);
      setIsGeneratingPdf(false);
    }
  }, [isGeneratingPdf, selectedWeek, updateProgress, weeks]);

  const rawMaxValue = Math.max(
    ...chartData.map(d => Math.max(d.sales, d.expenses, d.om, d.gm, d.fc)),
    100
  );
  
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
  const spacingSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasStoredSpacingRef = useRef(false);
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
    defaultDayLabelSpacing
  );
  const scaleY = useCallback(
    (value: number) => chartTopPadding + chartHeight - (value / maxValue) * chartHeight,
    [chartHeight, chartTopPadding, maxValue]
  );

  useEffect(() => {
    let isMounted = true;
    const loadSavedSpacing = async () => {
      try {
        const storedValue = await AsyncStorage.getItem(WEEKLY_DAY_LABEL_SPACING_KEY);
        if (storedValue !== null) {
          const parsed = Number(storedValue);
          if (!Number.isNaN(parsed)) {
            const normalized = normalizeDayLabelSpacing(parsed);
            hasStoredSpacingRef.current = true;
            if (isMounted) {
              setDayLabelSpacing(prev => (prev === normalized ? prev : normalized));
            }
            return;
          }
        }
      } catch (error) {
        console.log('Failed to load weekly day label spacing:', error);
      }

      if (isMounted && !hasStoredSpacingRef.current) {
        setDayLabelSpacing(defaultDayLabelSpacing);
      }
    };

    loadSavedSpacing();

    return () => {
      isMounted = false;
    };
  }, [defaultDayLabelSpacing, normalizeDayLabelSpacing]);

  useEffect(() => {
    if (spacingSaveTimeoutRef.current) {
      clearTimeout(spacingSaveTimeoutRef.current);
    }

    spacingSaveTimeoutRef.current = setTimeout(() => {
      AsyncStorage.setItem(WEEKLY_DAY_LABEL_SPACING_KEY, String(dayLabelSpacing)).catch(error => {
        console.log('Failed to save weekly day label spacing:', error);
      });
    }, 300);

    return () => {
      if (spacingSaveTimeoutRef.current) {
        clearTimeout(spacingSaveTimeoutRef.current);
      }
    };
  }, [dayLabelSpacing]);

  const updateDayLabelSpacing = useCallback(
    (value: number) => {
      const normalized = normalizeDayLabelSpacing(value);
      setDayLabelSpacing(normalized);
    },
    [normalizeDayLabelSpacing]
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

  const omPathData = chartData.map((point, index) => {
    const x = index * stepX;
    const y = scaleY(point.om);
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const gmPathData = chartData.map((point, index) => {
    const x = index * stepX;
    const y = scaleY(point.gm);
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const fcPathData = chartData.map((point, index) => {
    const x = index * stepX;
    const y = scaleY(point.fc);
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const labelData = useMemo(() => {
    const labelOffset = 10;
    const collisionThreshold = 14;
    const collisionOffset = 18;
    const collisionSideOffset = 6;
    const labelHeight = 12;
    const labelPaddingX = 3;
    const charWidth = 5.4;
    const extraOffsetStep = 12;
    const extraOffsets = {
      om: labelOffset + extraOffsetStep,
      gm: labelOffset,
      fc: labelOffset,
    };

    return chartData.map((point, index) => {
      const x = index * stepX;
      const ySales = scaleY(point.sales);
      const yExpenses = scaleY(point.expenses);
      const yOm = scaleY(point.om);
      const yGm = scaleY(point.gm);
      const yFc = scaleY(point.fc);
      const salesLabel = formatCompactNumber(point.sales);
      const expenseLabel = formatCompactNumber(point.expenses);
      const omLabel = formatCurrency(point.om);
      const gmLabel = formatCurrency(point.gm);
      const fcLabel = formatCurrency(point.fc);
      const salesWidth = salesLabel.length * charWidth;
      const expenseWidth = expenseLabel.length * charWidth;
      const omWidth = omLabel.length * charWidth;
      const gmWidth = gmLabel.length * charWidth;
      const fcWidth = fcLabel.length * charWidth;
      const minSalesX = salesWidth / 2 + labelPaddingX;
      const minExpenseX = expenseWidth / 2 + labelPaddingX;
      const minOmX = omWidth / 2 + labelPaddingX;
      const minGmX = gmWidth / 2 + labelPaddingX;
      const minFcX = fcWidth / 2 + labelPaddingX;
      const maxSalesX = chartSvgWidth - minSalesX;
      const maxExpenseX = chartSvgWidth - minExpenseX;
      const maxOmX = chartSvgWidth - minOmX;
      const maxGmX = chartSvgWidth - minGmX;
      const maxFcX = chartSvgWidth - minFcX;

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
      const omLabelX = clamp(x, minOmX, maxOmX);
      const gmLabelX = clamp(x, minGmX, maxGmX);
      const fcLabelX = clamp(x, minFcX, maxFcX);
      const salesLabelY = Math.max(4 + labelHeight / 2, ySales - salesOffset);
      const expenseLabelY = Math.max(4 + labelHeight / 2, yExpenses - expenseOffset);
      const omLabelY = Math.max(4 + labelHeight / 2, yOm - extraOffsets.om);
      const gmLabelY = Math.max(4 + labelHeight / 2, yGm - extraOffsets.gm);
      const fcLabelY = Math.max(4 + labelHeight / 2, yFc - extraOffsets.fc);

      return {
        x,
        ySales,
        yExpenses,
        yOm,
        yGm,
        yFc,
        salesLabel,
        expenseLabel,
        omLabel,
        gmLabel,
        fcLabel,
        salesLabelX,
        salesLabelY,
        expenseLabelX,
        expenseLabelY,
        omLabelX,
        omLabelY,
        gmLabelX,
        gmLabelY,
        fcLabelX,
        fcLabelY,
        salesLabelWidth: salesWidth,
        expenseLabelWidth: expenseWidth,
        omLabelWidth: omWidth,
        gmLabelWidth: gmWidth,
        fcLabelWidth: fcWidth,
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
              <View style={styles.weekTotalsRow}>
                <View style={[styles.weekTotalCard, { backgroundColor: omColor + '15' }]}>
                  <Text style={[styles.weekTotalLabel, { color: theme.textSecondary }]}>Operation Manager</Text>
                  <Text style={[styles.weekTotalValue, { color: omColor }]}>
                    {formatCurrency(weeklySplitAmounts.operation)}
                  </Text>
                </View>
                <View style={[styles.weekTotalCard, { backgroundColor: gmColor + '15' }]}>
                  <Text style={[styles.weekTotalLabel, { color: theme.textSecondary }]}>General Manager</Text>
                  <Text style={[styles.weekTotalValue, { color: gmColor }]}>
                    {formatCurrency(weeklySplitAmounts.general)}
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
                  <Text style={[styles.legendText, { color: showSales ? theme.chartLine : theme.textMuted }]}>S</Text>
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
                  <Text style={[styles.legendText, { color: showExpenses ? theme.error : theme.textMuted }]}>E</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[
                    styles.legendToggle,
                    { borderColor: showOm ? omColor : theme.cardBorder },
                    showOm && { backgroundColor: omColor + '20' }
                  ]}
                  onPress={() => setShowOm(!showOm)}
                >
                  <View style={[styles.legendDot, { backgroundColor: omColor, opacity: showOm ? 1 : 0.4 }]} />
                  <Text style={[styles.legendText, { color: showOm ? omColor : theme.textMuted }]}>OM</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[
                    styles.legendToggle,
                    { borderColor: showGm ? gmColor : theme.cardBorder },
                    showGm && { backgroundColor: gmColor + '20' }
                  ]}
                  onPress={() => setShowGm(!showGm)}
                >
                  <View style={[styles.legendDot, { backgroundColor: gmColor, opacity: showGm ? 1 : 0.4 }]} />
                  <Text style={[styles.legendText, { color: showGm ? gmColor : theme.textMuted }]}>GM</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[
                    styles.legendToggle,
                    { borderColor: showFc ? fcColor : theme.cardBorder },
                    showFc && { backgroundColor: fcColor + '20' }
                  ]}
                  onPress={() => setShowFc(!showFc)}
                >
                  <View style={[styles.legendDot, { backgroundColor: fcColor, opacity: showFc ? 1 : 0.4 }]} />
                  <Text style={[styles.legendText, { color: showFc ? fcColor : theme.textMuted }]}>FC</Text>
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

                    {showOm && (
                      <Path d={omPathData} stroke={omColor} strokeWidth={2} fill="none" />
                    )}
                    {showGm && (
                      <Path d={gmPathData} stroke={gmColor} strokeWidth={2} fill="none" />
                    )}
                    {showFc && (
                      <Path d={fcPathData} stroke={fcColor} strokeWidth={2} fill="none" />
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
                    {showOm && chartData.map((point, index) => (
                      <Circle
                        key={`om-${index}`}
                        cx={index * stepX}
                        cy={scaleY(point.om)}
                        r={3}
                        fill={omColor}
                      />
                    ))}
                    {showGm && chartData.map((point, index) => (
                      <Circle
                        key={`gm-${index}`}
                        cx={index * stepX}
                        cy={scaleY(point.gm)}
                        r={3}
                        fill={gmColor}
                      />
                    ))}
                    {showFc && chartData.map((point, index) => (
                      <Circle
                        key={`fc-${index}`}
                        cx={index * stepX}
                        cy={scaleY(point.fc)}
                        r={3}
                        fill={fcColor}
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
                          fill={labelBackgroundFill}
                          opacity={0.85}
                        />
                        <SvgText
                          x={label.salesLabelX}
                          y={label.salesLabelY}
                          fontSize={9}
                          textAnchor="middle"
                          alignmentBaseline="middle"
                          fill={SALES_LABEL_BLUE}
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
                          fill={labelBackgroundFill}
                          opacity={0.85}
                        />
                        <SvgText
                          x={label.expenseLabelX}
                          y={label.expenseLabelY}
                          fontSize={9}
                          textAnchor="middle"
                          alignmentBaseline="middle"
                          fill={EXPENSE_LABEL_RED}
                        >
                          {label.expenseLabel}
                        </SvgText>
                      </React.Fragment>
                    ))}
                    {showOm && labelData.map((label, index) => (
                      <React.Fragment key={`om-label-${index}`}>
                        <Rect
                          x={label.omLabelX - label.omLabelWidth / 2 - label.labelPaddingX}
                          y={label.omLabelY - label.labelHeight / 2}
                          width={label.omLabelWidth + label.labelPaddingX * 2}
                          height={label.labelHeight}
                          rx={3}
                          fill={labelBackgroundFill}
                          opacity={0.85}
                        />
                        <SvgText
                          x={label.omLabelX}
                          y={label.omLabelY}
                          fontSize={9}
                          textAnchor="middle"
                          alignmentBaseline="middle"
                          fill={omLabelColor}
                        >
                          {label.omLabel}
                        </SvgText>
                      </React.Fragment>
                    ))}
                    {showGm && labelData.map((label, index) => (
                      <React.Fragment key={`gm-label-${index}`}>
                        <Rect
                          x={label.gmLabelX - label.gmLabelWidth / 2 - label.labelPaddingX}
                          y={label.gmLabelY - label.labelHeight / 2}
                          width={label.gmLabelWidth + label.labelPaddingX * 2}
                          height={label.labelHeight}
                          rx={3}
                          fill={labelBackgroundFill}
                          opacity={0.85}
                        />
                        <SvgText
                          x={label.gmLabelX}
                          y={label.gmLabelY}
                          fontSize={9}
                          textAnchor="middle"
                          alignmentBaseline="middle"
                          fill={gmLabelColor}
                        >
                          {label.gmLabel}
                        </SvgText>
                      </React.Fragment>
                    ))}
                    {showFc && labelData.map((label, index) => (
                      <React.Fragment key={`fc-label-${index}`}>
                        <Rect
                          x={label.fcLabelX - label.fcLabelWidth / 2 - label.labelPaddingX}
                          y={label.fcLabelY - label.labelHeight / 2}
                          width={label.fcLabelWidth + label.labelPaddingX * 2}
                          height={label.labelHeight}
                          rx={3}
                          fill={labelBackgroundFill}
                          opacity={0.85}
                        />
                        <SvgText
                          x={label.fcLabelX}
                          y={label.fcLabelY}
                          fontSize={9}
                          textAnchor="middle"
                          alignmentBaseline="middle"
                          fill={chartLabelColor}
                        >
                          {label.fcLabel}
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

          <View style={[styles.exportCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Export PDF Summary</Text>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.primary },
                isGeneratingPdf && styles.primaryButtonDisabled,
              ]}
              onPress={handleGeneratePdf}
              disabled={isGeneratingPdf}
            >
              <Text style={styles.primaryButtonText}>Generate PDF Summary</Text>
            </TouchableOpacity>
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
        <Modal visible={showProgressModal} transparent animationType="fade">
          <View style={[styles.progressOverlay, { backgroundColor: theme.modalOverlay }]}>
            <View style={[styles.progressCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <Text style={[styles.progressTitle, { color: theme.text }]}>Exporting PDF</Text>
              <Text style={[styles.progressMessage, { color: theme.textSecondary }]}>{progressMessage}</Text>
              <View style={[styles.progressBar, { backgroundColor: theme.cardHighlight }]}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: theme.primary, width: `${progressValue}%` },
                  ]}
                />
              </View>
              <Text style={[styles.progressPercent, { color: theme.text }]}>
                Generating… {Math.round(progressValue)}%
              </Text>
            </View>
          </View>
        </Modal>
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
    flexWrap: 'wrap',
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
  exportCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    marginBottom: 16,
  },
  primaryButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600' as const,
    fontSize: 14,
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
  progressOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  progressCard: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  progressMessage: {
    fontSize: 13,
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 8,
  },
  progressPercent: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '500' as const,
  },
});
