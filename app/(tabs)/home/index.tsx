import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Package, ShoppingCart, User, Settings } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

import { formatDate, ROLE_DISPLAY_NAMES, UserRole } from '@/types';
import { getSalesByDateRange, getExpensesByDateRange, getActivities, getUsers } from '@/services/database';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import LaserBackground from '@/components/LaserBackground';

const { width } = Dimensions.get('window');

function getWeekDates(weeksAgo: number = 0) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + 1 - (weeksAgo * 7));
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  
  return { start: monday, end: sunday };
}

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

export default function HomeScreen() {
  const { settings, user: currentUser } = useAuth();
  const theme = settings.darkMode ? Colors.dark : Colors.light;
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [showSales, setShowSales] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);

  const { width: screenWidth } = useWindowDimensions();
  
  const welcomeFontSize = screenWidth < 360 ? 18 : screenWidth < 400 ? 20 : 24;

  const weeks = useMemo(() => {
    return [0, 1, 2, 3].map(i => {
      const { start, end } = getWeekDates(i);
      return { start, end, label: formatWeekRange(start, end) };
    });
  }, []);

  const currentWeek = weeks[selectedWeek];
  const startDateStr = currentWeek.start.toISOString().split('T')[0];
  const endDateStr = currentWeek.end.toISOString().split('T')[0];

  const { data: salesData = [], refetch: refetchSales } = useQuery({
    queryKey: ['sales', startDateStr, endDateStr],
    queryFn: () => getSalesByDateRange(startDateStr, endDateStr),
  });

  const { data: expensesData = [], refetch: refetchExpenses } = useQuery({
    queryKey: ['expenses', startDateStr, endDateStr],
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

  const getAuthorDisplayName = useCallback((userId: string): string => {
    const author = userMap.get(userId);
    if (!author) return 'Unknown';
    if (author.name && author.name.trim() !== '') {
      return author.name;
    }
    return ROLE_DISPLAY_NAMES[author.role] || 'Unknown';
  }, [userMap]);

  const canViewAuthor = currentUser && AUTHOR_VISIBLE_ROLES.includes(currentUser.role);

  const chartData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = days.map((day, index) => {
      const date = new Date(currentWeek.start);
      date.setDate(date.getDate() + index);
      const dateStr = date.toISOString().split('T')[0];
      
      const daySales = salesData
        .filter(s => s.date === dateStr)
        .reduce((sum, s) => sum + s.total, 0);

      const dayExpenses = expensesData
        .filter(e => e.date === dateStr)
        .reduce((sum, e) => sum + e.total, 0);
      
      return { day, sales: daySales, expenses: dayExpenses };
    });
    return data;
  }, [salesData, expensesData, currentWeek]);

  const maxValue = Math.max(...chartData.map(d => Math.max(d.sales, d.expenses)), 200);
  const chartHeight = 150;
  const chartWidth = width - 100;
  const stepX = chartWidth / 6;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchSales(), refetchExpenses(), refetchActivities(), refetchUsers()]);
    setRefreshing(false);
  }, [refetchSales, refetchExpenses, refetchActivities, refetchUsers]);

  const pathData = chartData.map((point, index) => {
    const x = index * stepX;
    const y = chartHeight - (point.sales / maxValue) * chartHeight;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const areaPath = `${pathData} L ${(chartData.length - 1) * stepX} ${chartHeight} L 0 ${chartHeight} Z`;

  const expensePathData = chartData.map((point, index) => {
    const x = index * stepX;
    const y = chartHeight - (point.expenses / maxValue) * chartHeight;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const expenseAreaPath = `${expensePathData} L ${(chartData.length - 1) * stepX} ${chartHeight} L 0 ${chartHeight} Z`;

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
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{"Today's Overview"}</Text>
              
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
                <View style={styles.yAxis}>
                  {[200, 150, 100, 50, 0].map((val, i) => (
                    <Text key={i} style={[styles.yAxisLabel, { color: theme.textMuted }]}>
                      ₱{val}
                    </Text>
                  ))}
                </View>
                
                <Svg width={chartWidth} height={chartHeight + 30} style={styles.chart}>
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
                      cx={index * stepX}
                      cy={chartHeight - (point.sales / maxValue) * chartHeight}
                      r={4}
                      fill={theme.chartLine}
                    />
                  ))}
                  {showExpenses && chartData.map((point, index) => (
                    <Circle
                      key={`expense-${index}`}
                      cx={index * stepX}
                      cy={chartHeight - (point.expenses / maxValue) * chartHeight}
                      r={3}
                      fill={theme.error}
                    />
                  ))}
                </Svg>
              </View>
              
              <View style={styles.xAxis}>
                {chartData.map((point, index) => (
                  <Text key={index} style={[styles.xAxisLabel, { color: theme.textMuted }]}>
                    {point.day}
                  </Text>
                ))}
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
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  yAxis: {
    width: 40,
    height: 150,
    justifyContent: 'space-between',
    paddingRight: 8,
  },
  yAxisLabel: {
    fontSize: 10,
    textAlign: 'right',
  },
  chart: {
    marginLeft: 8,
  },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingLeft: 48,
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
});
