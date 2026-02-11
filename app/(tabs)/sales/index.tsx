import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  RefreshControl,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar, Plus, X, Trash2, PieChart, Save, AlertCircle, Clock, RefreshCw } from 'lucide-react-native';
import CalendarModal from '@/components/CalendarModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { useSync } from '@/contexts/SyncContext';
import { Colors } from '@/constants/colors';
import { Expense, ExpenseItem, Sale, formatCurrency, formatDate, formatShortDate } from '@/types';
import { calculateNetSalesSplitAmounts } from '@/services/netSalesSplit';
import { 
  getSalesByDate, getExpensesByDate, createSale, createExpense,
  deleteSale, deleteExpense, createActivity, getPendingSummaryAndItems, PendingSummary
} from '@/services/database';
import { formatLocalDate } from '@/services/dateUtils';
import LaserBackground from '@/components/LaserBackground';
import ExpenseModal from '@/components/ExpenseModal';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

export default function SalesScreen() {
  const { user, settings } = useAuth();
  const { queueDeletion, pendingCount, triggerFullSync, checkPendingCount, isOnline } = useSync();
  const theme = settings.darkMode ? Colors.dark : Colors.light;
  const queryClient = useQueryClient();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const leftRailWidth = 110;

  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingSummary, setPendingSummary] = useState<PendingSummary | null>(null);
  const [isSyncingPending, setIsSyncingPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const [saleName, setSaleName] = useState('');
  const [saleTotal, setSaleTotal] = useState('');
  const [saleItems, setSaleItems] = useState<string[]>([]);
  const [saleItemInput, setSaleItemInput] = useState('');
  
  

  const [showSplitModal, setShowSplitModal] = useState(false);
  const [operationManagerPercent, setOperationManagerPercent] = useState(65);
  const [generalManagerPercent, setGeneralManagerPercent] = useState(25);
  const [foodCartPercent, setFoodCartPercent] = useState(10);
  const [tempOperationPercent, setTempOperationPercent] = useState(65);
  const [tempGeneralPercent, setTempGeneralPercent] = useState(25);
  const [tempFoodCartPercent, setTempFoodCartPercent] = useState(10);
  const [includeExpenses, setIncludeExpenses] = useState(true);
  
  const loadPendingSummary = useCallback(async () => {
    try {
      const summary = await getPendingSummaryAndItems(50);
      setPendingSummary(summary);
    } catch (error) {
      console.log('Error loading pending summary:', error);
    }
  }, []);

  useEffect(() => {
    if (showPendingModal) {
      loadPendingSummary();
    }
  }, [showPendingModal, pendingCount, loadPendingSummary]);


  useEffect(() => {
    loadSplitPercentages();
  }, []);

  const loadSplitPercentages = async () => {
    try {
      const stored = await AsyncStorage.getItem('netSalesSplit');
      if (stored) {
        const { operation, general, foodCart, includeExp } = JSON.parse(stored);
        setOperationManagerPercent(operation);
        setGeneralManagerPercent(general);
        setFoodCartPercent(foodCart);
        setTempOperationPercent(operation);
        setTempGeneralPercent(general);
        setTempFoodCartPercent(foodCart);
        if (includeExp !== undefined) setIncludeExpenses(includeExp);
      }
    } catch (error) {
      console.log('Error loading split percentages:', error);
    }
  };

  const dateStr = formatLocalDate(selectedDate);

  const { data: sales = [], refetch: refetchSales } = useQuery({
    queryKey: ['sales', dateStr],
    queryFn: () => getSalesByDate(dateStr),
  });

  const { data: expenses = [], refetch: refetchExpenses } = useQuery({
    queryKey: ['expenses', dateStr],
    queryFn: () => getExpensesByDate(dateStr),
  });

  const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.total, 0);

  const netSales = totalSales - totalExpenses;
  const splitBase = includeExpenses ? netSales : totalSales;
  const isNegativeNet = splitBase < 0;
  const splitAmounts = calculateNetSalesSplitAmounts(totalSales, totalExpenses, {
    operation: operationManagerPercent,
    general: generalManagerPercent,
    foodCart: foodCartPercent,
    includeExp: includeExpenses,
  });
  const effectiveNetSales = splitAmounts.base;
  const operationManagerAmount = splitAmounts.operation;
  const generalManagerAmount = splitAmounts.general;
  const foodCartAmount = splitAmounts.foodCart;
  const currentSplitTotal = tempOperationPercent + tempGeneralPercent + tempFoodCartPercent;

  const saveSplitPercentages = async () => {
    try {
      const totalPercent = tempOperationPercent + tempGeneralPercent + tempFoodCartPercent;
      if (totalPercent !== 100) {
        Alert.alert('Total must equal 100%', 'Total must equal 100%');
        return;
      }
      await AsyncStorage.setItem('netSalesSplit', JSON.stringify({
        operation: tempOperationPercent,
        general: tempGeneralPercent,
        foodCart: tempFoodCartPercent,
        includeExp: includeExpenses,
      }));
      setOperationManagerPercent(tempOperationPercent);
      setGeneralManagerPercent(tempGeneralPercent);
      setFoodCartPercent(tempFoodCartPercent);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowSplitModal(false);
    } catch (error) {
      console.log('Error saving split percentages:', error);
    }
  };

  const adjustPercentage = (type: 'operation' | 'general' | 'foodCart', delta: number) => {
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const applyValue = (setter: (value: number) => void, current: number) => {
      const nextValue = clamp(current + delta, 0, 100);
      if (nextValue === current) {
        Haptics.selectionAsync();
        return;
      }
      setter(nextValue);
      Haptics.selectionAsync();
    };

    if (type === 'operation') {
      applyValue(setTempOperationPercent, tempOperationPercent);
      return;
    }

    if (type === 'general') {
      applyValue(setTempGeneralPercent, tempGeneralPercent);
      return;
    }

    applyValue(setTempFoodCartPercent, tempFoodCartPercent);
    return;
  };

  const openSplitModal = () => {
    setTempOperationPercent(operationManagerPercent);
    setTempGeneralPercent(generalManagerPercent);
    setTempFoodCartPercent(foodCartPercent);
    setShowSplitModal(true);
  };

  const createSaleMutation = useMutation({
    mutationFn: (data: { name: string; total: number; items: string[] }) => 
      createSale({ ...data, date: dateStr, createdBy: user?.id || '' }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['weeklySalesTotals'] });
      if (user) {
        await createActivity({
          type: 'sale_add',
          description: 'New Sale posted',
          userId: user.id,
        });
        queryClient.invalidateQueries({ queryKey: ['activities'] });
      }
      await checkPendingCount();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const createExpenseMutation = useMutation({
    mutationFn: (data: { name: string; total: number; items: ExpenseItem[] }) => 
      createExpense({ ...data, date: dateStr, createdBy: user?.id || '' }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['weeklyExpenseTotals'] });
      if (user) {
        await createActivity({
          type: 'expense_add',
          description: 'New Expense added',
          userId: user.id,
        });
        queryClient.invalidateQueries({ queryKey: ['activities'] });
      }
      await checkPendingCount();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteSaleMutation = useMutation({
    mutationFn: async (sale: Sale) => {
      await queueDeletion('sales', sale.id, {
        name: sale.name,
        amount: sale.total,
        date: sale.date,
      });
      return deleteSale(sale.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expense: Expense) => {
      await queueDeletion('expenses', expense.id, {
        name: expense.name,
        amount: expense.total,
        date: expense.date,
      });
      return deleteExpense(expense.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchSales(), refetchExpenses()]);
    setRefreshing(false);
  }, [refetchSales, refetchExpenses]);

  const handleAddSale = async () => {
    if (!saleTotal) return;
    await createSaleMutation.mutateAsync({
      name: saleName.trim(),
      total: parseFloat(saleTotal),
      items: saleItems,
    });
    resetSaleForm();
    setShowSaleModal(false);
  };

  const handleSubmitExpense = useCallback(async (payload: { name: string; total: number; items: ExpenseItem[] }) => {
    await createExpenseMutation.mutateAsync(payload);
  }, [createExpenseMutation]);

  const resetSaleForm = () => {
    setSaleName('');
    setSaleTotal('');
    setSaleItems([]);
    setSaleItemInput('');
  };

  const addSaleItem = () => {
    const trimmed = saleItemInput.trim();
    if (!trimmed) return;
    setSaleItems(prev => [...prev, trimmed]);
    setSaleItemInput('');
  };

  const handleDeleteSale = (sale: Sale) => {
    if (Platform.OS === 'web') {
      if (confirm(`Delete sale "${sale.name}"?`)) {
        deleteSaleMutation.mutate(sale);
      }
    } else {
      Alert.alert('Delete Sale', `Delete "${sale.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteSaleMutation.mutate(sale) },
      ]);
    }
  };

  const handleDeleteExpense = (expense: Expense) => {
    if (Platform.OS === 'web') {
      if (confirm(`Delete expense "${expense.name}"?`)) {
        deleteExpenseMutation.mutate(expense);
      }
    } else {
      Alert.alert('Delete Expense', `Delete "${expense.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteExpenseMutation.mutate(expense) },
      ]);
    }
  };

  const handleCalendarConfirm = (date: Date) => {
    setSelectedDate(date);
    setShowCalendar(false);
  };

  const pendingSales = pendingSummary?.itemsByTable.sales ?? [];
  const pendingExpenses = pendingSummary?.itemsByTable.expenses ?? [];
  const pendingDeletions = pendingSummary?.itemsByTable.deletions ?? [];
  const pendingItems = [
    ...pendingSales.map(item => ({
      id: item.id,
      type: 'Sale',
      name: item.name?.trim() ? item.name : 'Sale',
      amount: item.total,
      date: item.date,
      status: item.syncStatus || 'pending',
    })),
    ...pendingExpenses.map(item => ({
      id: item.id,
      type: 'Expense',
      name: item.name?.trim() ? item.name : 'Expense',
      amount: item.total,
      date: item.date,
      status: item.syncStatus || 'pending',
    })),
    ...pendingDeletions
      .filter(item => item.entityType === 'sale' || item.entityType === 'expense')
      .map(item => ({
        id: item.id,
        type: item.entityType === 'sale' ? 'Deleted Sale' : 'Deleted Expense',
        name: item.name?.trim()
          ? item.name
          : `${item.entityId} (deleted locally)`,
        amount: item.amount ?? null,
        date: item.date || item.createdAt,
        status: item.syncStatus || 'pending',
      })),
  ];

  const handlePendingSync = async () => {
    if (!isOnline) {
      Alert.alert('Offline', "You're offline. Pending items will sync next time.");
      return;
    }
    setIsSyncingPending(true);
    try {
      const result = await triggerFullSync({ reason: 'manual' });
      await checkPendingCount();
      await loadPendingSummary();
      if (result.ok) {
        Alert.alert('Synced successfully', 'All pending items have been synchronized.');
      } else {
        Alert.alert('Sync failed', 'We could not sync all items. Please try again.');
      }
    } catch (error) {
      Alert.alert('Sync failed', 'We could not sync your pending items. Please try again.');
    } finally {
      setIsSyncingPending(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={[theme.backgroundGradientStart, theme.backgroundGradientEnd]}
        style={StyleSheet.absoluteFill}
      />
      {settings.laserBackground && (
        <LaserBackground isDarkMode={settings.darkMode} colorPalette={settings.backgroundColorPalette} intensity={settings.backgroundIntensity} />
      )}
      
      <SafeAreaView
        style={[styles.safeArea, isLandscape && { paddingLeft: leftRailWidth + 16, paddingRight: 16 }]}
        edges={['top']}
      >
        <View style={[styles.header, { borderBottomColor: theme.divider }]}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Sales</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.pendingButton, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
              onPress={() => setShowPendingModal(true)}
            >
              <Clock color={theme.warning} size={20} />
              {pendingCount > 0 && (
                <View style={[styles.pendingBadge, { backgroundColor: theme.error }]}>
                  <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.calendarButton, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
              onPress={() => setShowCalendar(true)}
            >
              <Calendar color={theme.primary} size={20} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.dateSection}>
          <Text style={[styles.selectedDate, { color: theme.text }]}>
            {formatDate(selectedDate)}
          </Text>
          
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.success }]}
              onPress={() => setShowSaleModal(true)}
            >
              <Plus color="#fff" size={18} />
              <Text style={styles.actionButtonText}>Add New Sale</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.error }]}
              onPress={() => setShowExpenseModal(true)}
            >
              <Plus color="#fff" size={18} />
              <Text style={styles.actionButtonText}>Add New Expense</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={[styles.contentContainer, isLandscape ? { paddingBottom: insets.bottom + 16 } : { paddingBottom: tabBarHeight + insets.bottom + 16 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
        >
          <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Total Sales</Text>
              <Text style={[styles.summaryValue, { color: theme.success }]}>{formatCurrency(totalSales)}</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: theme.divider }]} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Total Expenses</Text>
              <Text style={[styles.summaryValue, { color: theme.error }]}>{formatCurrency(totalExpenses)}</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: theme.divider }]} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Net Sales</Text>
              <Text style={[styles.summaryValue, { color: isNegativeNet ? theme.error : theme.primary }]}>
                {formatCurrency(netSales)}
              </Text>
            </View>
          </View>

          {/* Net Sales Split Section */}
          <View style={[styles.splitCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.splitHeader}>
              <View style={styles.splitTitleRow}>
                <PieChart color={theme.primary} size={20} />
                <Text style={[styles.splitTitle, { color: theme.text }]}>Net Sales Split</Text>
              </View>
              <TouchableOpacity
                style={[styles.adjustButton, { backgroundColor: theme.primary + '20' }]}
                onPress={openSplitModal}
              >
                <Text style={[styles.adjustButtonText, { color: theme.primary }]}>Adjust</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.includeExpensesButton, { backgroundColor: includeExpenses ? theme.error + '20' : theme.success + '20' }]}
              onPress={() => {
                setIncludeExpenses(!includeExpenses);
                Haptics.selectionAsync();
              }}
            >
              <Text style={[styles.includeExpensesText, { color: includeExpenses ? theme.error : theme.success }]}>
                {includeExpenses ? 'Expenses Included' : 'Expenses Excluded'}
              </Text>
              <Text style={[styles.includeExpensesHint, { color: theme.textMuted }]}>
                Tap to {includeExpenses ? 'exclude' : 'include'} expenses from split
              </Text>
            </TouchableOpacity>

            {isNegativeNet && (
              <View style={[styles.warningBanner, { backgroundColor: theme.warning + '20' }]}>
                <AlertCircle color={theme.warning} size={16} />
                <Text style={[styles.warningText, { color: theme.warning }]}>
                  {includeExpenses ? 'Net sales are negative. Split calculation requires positive Total Sales.' : 'Total sales are negative. Split calculation requires positive Total Sales.'}
                </Text>
              </View>
            )}

            <View style={styles.splitItems}>
              <View style={styles.splitItem}>
                <View style={styles.splitItemLeft}>
                  <View style={[styles.splitDot, { backgroundColor: '#4CAF50' }]} />
                  <Text style={[styles.splitItemLabel, { color: theme.textSecondary }]}>Operation Manager</Text>
                </View>
                <View style={styles.splitItemRight}>
                  <Text style={[styles.splitPercent, { color: theme.textMuted }]}>{operationManagerPercent}%</Text>
                  <Text style={[styles.splitAmount, { color: theme.text }]}>{formatCurrency(operationManagerAmount)}</Text>
                </View>
              </View>

              <View style={styles.splitItem}>
                <View style={styles.splitItemLeft}>
                  <View style={[styles.splitDot, { backgroundColor: '#2196F3' }]} />
                  <Text style={[styles.splitItemLabel, { color: theme.textSecondary }]}>General Manager</Text>
                </View>
                <View style={styles.splitItemRight}>
                  <Text style={[styles.splitPercent, { color: theme.textMuted }]}>{generalManagerPercent}%</Text>
                  <Text style={[styles.splitAmount, { color: theme.text }]}>{formatCurrency(generalManagerAmount)}</Text>
                </View>
              </View>

              <View style={styles.splitItem}>
                <View style={styles.splitItemLeft}>
                  <View style={[styles.splitDot, { backgroundColor: '#FF9800' }]} />
                  <Text style={[styles.splitItemLabel, { color: theme.textSecondary }]}>Food Cart</Text>
                </View>
                <View style={styles.splitItemRight}>
                  <Text style={[styles.splitPercent, { color: theme.textMuted }]}>{foodCartPercent}%</Text>
                  <Text style={[styles.splitAmount, { color: theme.text }]}>{formatCurrency(foodCartAmount)}</Text>
                </View>
              </View>
            </View>

            {/* Visual Bar */}
            <View style={styles.splitBarContainer}>
              <View style={[styles.splitBar, { width: `${operationManagerPercent}%`, backgroundColor: '#4CAF50' }]} />
              <View style={[styles.splitBar, { width: `${generalManagerPercent}%`, backgroundColor: '#2196F3' }]} />
              <View style={[styles.splitBar, { width: `${foodCartPercent}%`, backgroundColor: '#FF9800' }]} />
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>Sales ({sales.length})</Text>
          {sales.map(sale => {
            const saleNameLabel = sale.name?.trim() ? sale.name : 'Sale';
            const saleItemsList = Array.isArray(sale.items) ? sale.items : [];
            return (
              <View key={sale.id} style={[styles.itemCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, { color: theme.text }]}>{saleNameLabel}</Text>
                  {saleItemsList.length > 0 && (
                    <View style={styles.itemList}>
                      {saleItemsList.map((item, index) => (
                        <Text key={`${sale.id}-item-${index}`} style={[styles.itemListText, { color: theme.textSecondary }]}>
                          • {item}
                        </Text>
                      ))}
                    </View>
                  )}
                  <Text style={[styles.itemAmount, { color: theme.success }]}>{formatCurrency(sale.total)}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.deleteButton, { backgroundColor: theme.error + '20' }]}
                  onPress={() => handleDeleteSale(sale)}
                >
                  <Trash2 color={theme.error} size={18} />
                </TouchableOpacity>
              </View>
            );
          })}
          {sales.length === 0 && (
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No sales for this date</Text>
          )}

          <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 24 }]}>Expenses ({expenses.length})</Text>
          {expenses.map(expense => {
            const expenseNameLabel = expense.name?.trim() ? expense.name : 'Expense';
            const expenseItemsList = Array.isArray(expense.items) ? expense.items : [];
            return (
              <View key={expense.id} style={[styles.itemCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, { color: theme.text }]}>{expenseNameLabel}</Text>
                  {expenseItemsList.length > 0 && (
                    <View style={styles.itemList}>
                      {expenseItemsList.map(item => (
                        <Text key={item.id} style={[styles.itemListText, { color: theme.textSecondary }]}>
                          • {item.name}{typeof item.price === 'number' ? ` (${formatCurrency(item.price)})` : ''}
                        </Text>
                      ))}
                    </View>
                  )}
                  <Text style={[styles.itemAmount, { color: theme.error }]}>{formatCurrency(expense.total)}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.deleteButton, { backgroundColor: theme.error + '20' }]}
                  onPress={() => handleDeleteExpense(expense)}
                >
                  <Trash2 color={theme.error} size={18} />
                </TouchableOpacity>
              </View>
            );
          })}
          {expenses.length === 0 && (
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No expenses for this date</Text>
          )}
        </ScrollView>
      </SafeAreaView>

      <CalendarModal
        visible={showCalendar}
        onClose={() => setShowCalendar(false)}
        onConfirm={handleCalendarConfirm}
        initialDate={selectedDate}
        theme={theme}
      />

      <Modal visible={showSaleModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoidingView}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
          >
            <View style={[styles.formModal, { backgroundColor: theme.card }]}>
              <ScrollView
                contentContainerStyle={styles.formScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>Add New Sale</Text>
                  <TouchableOpacity onPress={() => { setShowSaleModal(false); resetSaleForm(); }}>
                    <X color={theme.textMuted} size={24} />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.formContent}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Name (optional)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                    placeholder="Sale description"
                    placeholderTextColor={theme.textMuted}
                    value={saleName}
                    onChangeText={setSaleName}
                  />
                  
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Total (₱)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                    placeholder="0.00"
                    placeholderTextColor={theme.textMuted}
                    value={saleTotal}
                    onChangeText={setSaleTotal}
                    keyboardType="decimal-pad"
                  />

                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Items (optional)</Text>
                  <View style={styles.itemsInputRow}>
                    <TextInput
                      style={[styles.itemsInput, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                      placeholder="Add item"
                      placeholderTextColor={theme.textMuted}
                      value={saleItemInput}
                      onChangeText={setSaleItemInput}
                    />
                    <TouchableOpacity
                      style={[styles.itemsAddButton, { backgroundColor: theme.primary }]}
                      onPress={addSaleItem}
                    >
                      <Text style={styles.itemsAddButtonText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                  {saleItems.length > 0 && (
                    <View style={styles.itemsList}>
                      {saleItems.map((item, index) => (
                        <View key={`${item}-${index}`} style={[styles.itemsListItem, { borderColor: theme.cardBorder }]}>
                          <Text style={[styles.itemsListText, { color: theme.text }]}>{item}</Text>
                          <TouchableOpacity
                            style={styles.itemsRemoveButton}
                            onPress={() => setSaleItems(prev => prev.filter((_, i) => i !== index))}
                          >
                            <X color={theme.textMuted} size={16} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                
                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={[styles.cancelButton, { borderColor: theme.cardBorder }]}
                    onPress={() => { setShowSaleModal(false); resetSaleForm(); }}
                  >
                    <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitButton, { backgroundColor: theme.success }]}
                    onPress={handleAddSale}
                  >
                    <Text style={styles.submitButtonText}>Add Sale</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <ExpenseModal
        visible={showExpenseModal}
        theme={theme}
        onClose={() => setShowExpenseModal(false)}
        onSubmit={handleSubmitExpense}
      />

      {/* Net Sales Split Adjustment Modal */}
      <Modal visible={showSplitModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.splitModal, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Adjust Net Sales Split</Text>
              <TouchableOpacity onPress={() => setShowSplitModal(false)}>
                <X color={theme.textMuted} size={24} />
              </TouchableOpacity>
            </View>

            <View style={styles.splitModalContent}>
              <Text style={[styles.splitModalNote, { color: theme.textMuted }]}>
                Total must equal 100%
              </Text>
              <Text
                style={[
                  styles.splitModalNote,
                  { color: currentSplitTotal === 100 ? theme.textMuted : theme.error },
                ]}
              >
                Current: {currentSplitTotal}%
              </Text>
              {currentSplitTotal !== 100 && (
                <Text style={[styles.helperText, { color: theme.error }]}>
                  Adjust values to total 100%.
                </Text>
              )}

              {/* Operation Manager */}
              <View style={styles.percentageRow}>
                <View style={styles.percentageLabelRow}>
                  <View style={[styles.splitDot, { backgroundColor: '#4CAF50' }]} />
                  <Text style={[styles.percentageLabel, { color: theme.text }]}>OP - Operation Manager</Text>
                </View>
                <View style={styles.percentageControls}>
                  <TouchableOpacity
                    style={[styles.percentageButton, { backgroundColor: theme.error + '20' }]}
                    onPress={() => adjustPercentage('operation', -1)}
                  >
                    <Text style={[styles.percentageButtonText, { color: theme.error }]}>-1</Text>
                  </TouchableOpacity>
                  <Text style={[styles.percentageValue, { color: theme.text }]}>{tempOperationPercent}%</Text>
                  <TouchableOpacity
                    style={[styles.percentageButton, { backgroundColor: theme.success + '20' }]}
                    onPress={() => adjustPercentage('operation', 1)}
                  >
                    <Text style={[styles.percentageButtonText, { color: theme.success }]}>+1</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* General Manager */}
              <View style={styles.percentageRow}>
                <View style={styles.percentageLabelRow}>
                  <View style={[styles.splitDot, { backgroundColor: '#2196F3' }]} />
                  <Text style={[styles.percentageLabel, { color: theme.text }]}>GM - General Manager</Text>
                </View>
                <View style={styles.percentageControls}>
                  <TouchableOpacity
                    style={[styles.percentageButton, { backgroundColor: theme.error + '20' }]}
                    onPress={() => adjustPercentage('general', -1)}
                  >
                    <Text style={[styles.percentageButtonText, { color: theme.error }]}>-1</Text>
                  </TouchableOpacity>
                  <Text style={[styles.percentageValue, { color: theme.text }]}>{tempGeneralPercent}%</Text>
                  <TouchableOpacity
                    style={[styles.percentageButton, { backgroundColor: theme.success + '20' }]}
                    onPress={() => adjustPercentage('general', 1)}
                  >
                    <Text style={[styles.percentageButtonText, { color: theme.success }]}>+1</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Food Cart */}
              <View style={styles.percentageRow}>
                <View style={styles.percentageLabelRow}>
                  <View style={[styles.splitDot, { backgroundColor: '#FF9800' }]} />
                  <Text style={[styles.percentageLabel, { color: theme.text }]}>FD - Food Cart</Text>
                </View>
                <View style={styles.percentageControls}>
                  <TouchableOpacity
                    style={[styles.percentageButton, { backgroundColor: theme.error + '20' }]}
                    onPress={() => adjustPercentage('foodCart', -1)}
                  >
                    <Text style={[styles.percentageButtonText, { color: theme.error }]}>-1</Text>
                  </TouchableOpacity>
                  <Text style={[styles.percentageValue, { color: theme.text }]}>{tempFoodCartPercent}%</Text>
                  <TouchableOpacity
                    style={[styles.percentageButton, { backgroundColor: theme.success + '20' }]}
                    onPress={() => adjustPercentage('foodCart', 1)}
                  >
                    <Text style={[styles.percentageButtonText, { color: theme.success }]}>+1</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Preview Bar */}
              <View style={styles.previewSection}>
                <Text style={[styles.previewLabel, { color: theme.textSecondary }]}>Preview</Text>
                <View style={styles.splitBarContainer}>
                  <View style={[styles.splitBar, { width: `${tempOperationPercent}%`, backgroundColor: '#4CAF50' }]} />
                  <View style={[styles.splitBar, { width: `${tempGeneralPercent}%`, backgroundColor: '#2196F3' }]} />
                  <View style={[styles.splitBar, { width: `${tempFoodCartPercent}%`, backgroundColor: '#FF9800' }]} />
                </View>
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.cardBorder }]}
                onPress={() => setShowSplitModal(false)}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitButton, 
                  { backgroundColor: currentSplitTotal === 100 ? theme.primary : theme.textMuted }
                ]}
                onPress={saveSplitPercentages}
                disabled={currentSplitTotal !== 100}
              >
                <Save color="#fff" size={18} />
                <Text style={styles.submitButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPendingModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.pendingModal, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Pending Sync</Text>
              <TouchableOpacity onPress={() => setShowPendingModal(false)}>
                <X color={theme.textMuted} size={24} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.pendingContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={[styles.pendingSummary, { borderColor: theme.cardBorder }]}>
                <View style={styles.pendingSummaryRow}>
                  <Text style={[styles.pendingSummaryLabel, { color: theme.textSecondary }]}>Sales</Text>
                  <Text style={[styles.pendingSummaryValue, { color: theme.text }]}>{pendingSummary?.totals.sales ?? 0}</Text>
                </View>
                <View style={styles.pendingSummaryRow}>
                  <Text style={[styles.pendingSummaryLabel, { color: theme.textSecondary }]}>Expenses</Text>
                  <Text style={[styles.pendingSummaryValue, { color: theme.text }]}>{pendingSummary?.totals.expenses ?? 0}</Text>
                </View>
                <View style={styles.pendingSummaryRow}>
                  <Text style={[styles.pendingSummaryLabel, { color: theme.textSecondary }]}>Deletes</Text>
                  <Text style={[styles.pendingSummaryValue, { color: theme.text }]}>{pendingSummary?.totals.deletions ?? 0}</Text>
                </View>
              </View>

              {pendingItems.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>All caught up</Text>
              ) : (
                <View style={styles.pendingList}>
                  {pendingItems.map(item => {
                    const amountText = typeof item.amount === 'number' ? formatCurrency(item.amount) : '—';
                    const statusColor = item.status === 'failed' ? theme.error : theme.warning;
                    const isSaleType = item.type.includes('Sale');
                    return (
                    <View key={`${item.type}-${item.id}`} style={[styles.pendingItem, { borderColor: theme.cardBorder }]}>
                      <View style={styles.pendingItemHeader}>
                        <Text style={[styles.pendingItemType, { color: theme.text }]}>{item.type}</Text>
                        <Text style={[styles.pendingItemStatus, { color: statusColor }]}>{item.status}</Text>
                      </View>
                      <Text style={[styles.pendingItemName, { color: theme.textSecondary }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={styles.pendingItemMeta}>
                        <Text style={[styles.pendingItemDate, { color: theme.textMuted }]}>
                          {item.date ? formatShortDate(item.date) : 'No date'}
                        </Text>
                        <Text style={[styles.pendingItemAmount, { color: isSaleType ? theme.success : theme.error }]}>
                          {amountText}
                        </Text>
                      </View>
                    </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.cardBorder }]}
                onPress={() => setShowPendingModal(false)}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary, opacity: isSyncingPending ? 0.7 : 1 }]}
                onPress={handlePendingSync}
                disabled={isSyncingPending}
              >
                {isSyncingPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <RefreshCw color="#fff" size={18} />
                )}
                <Text style={styles.submitButtonText}>
                  {isSyncingPending ? 'Syncing...' : 'Synchronize'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pendingButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700' as const,
  },
  calendarButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateSection: {
    padding: 16,
  },
  selectedDate: {
    fontSize: 16,
    fontWeight: '500' as const,
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  summaryDivider: {
    height: 1,
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 12,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500' as const,
    marginBottom: 4,
  },
  itemAmount: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  itemList: {
    marginBottom: 6,
    gap: 2,
  },
  itemListText: {
    fontSize: 12,
    lineHeight: 18,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  keyboardAvoidingView: {
    width: '100%',
  },
  formModal: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  formScrollContent: {
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  formContent: {
    padding: 20,
  },
  itemsInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  itemsInput: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  itemsPriceInput: {
    width: 110,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  itemsAddButton: {
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemsAddButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  itemsList: {
    marginTop: 12,
    gap: 8,
  },
  itemsListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  itemsListText: {
    fontSize: 14,
    flex: 1,
  },
  itemsRemoveButton: {
    marginLeft: 8,
  },
  helperText: {
    fontSize: 12,
    marginTop: 6,
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
  submitButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  splitCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  splitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  splitTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  splitTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  adjustButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  adjustButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  splitItems: {
    gap: 12,
  },
  splitItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  splitItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  splitDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  splitItemLabel: {
    fontSize: 14,
  },
  splitItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  splitPercent: {
    fontSize: 12,
    minWidth: 36,
    textAlign: 'right',
  },
  splitAmount: {
    fontSize: 15,
    fontWeight: '600' as const,
    minWidth: 80,
    textAlign: 'right',
  },
  splitBarContainer: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 16,
  },
  splitBar: {
    height: '100%',
  },
  splitModal: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    overflow: 'hidden',
  },
  splitModalContent: {
    padding: 20,
  },
  splitModalNote: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  percentageRow: {
    marginBottom: 20,
  },
  percentageLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  percentageLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  percentageControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  percentageButton: {
    width: 48,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  percentageButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  percentageValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    minWidth: 70,
    textAlign: 'center',
  },
  previewSection: {
    marginTop: 8,
  },
  previewLabel: {
    fontSize: 12,
    marginBottom: 8,
  },
  includeExpensesButton: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  includeExpensesText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  includeExpensesHint: {
    fontSize: 11,
    marginTop: 4,
  },
  pendingModal: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  pendingContent: {
    padding: 20,
    paddingBottom: 10,
  },
  pendingSummary: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  pendingSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pendingSummaryLabel: {
    fontSize: 13,
  },
  pendingSummaryValue: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  pendingList: {
    gap: 12,
  },
  pendingItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  pendingItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingItemType: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  pendingItemStatus: {
    fontSize: 12,
    fontWeight: '600' as const,
    textTransform: 'capitalize' as const,
  },
  pendingItemName: {
    fontSize: 13,
    marginTop: 4,
  },
  pendingItemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  pendingItemDate: {
    fontSize: 12,
  },
  pendingItemAmount: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
});
