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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Calendar, Plus, X, Trash2, PieChart, Save, AlertCircle } from 'lucide-react-native';
import CalendarModal from '@/components/CalendarModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { useSync } from '@/contexts/SyncContext';
import { Colors } from '@/constants/colors';
import { formatCurrency, formatDate } from '@/types';
import { 
  getSalesByDate, getExpensesByDate, createSale, createExpense,
  deleteSale, deleteExpense, createActivity
} from '@/services/database';
import { formatLocalDate } from '@/services/dateUtils';
import LaserBackground from '@/components/LaserBackground';

export default function SalesScreen() {
  const { user, settings } = useAuth();
  const { queueDeletion } = useSync();
  const theme = settings.darkMode ? Colors.dark : Colors.light;
  const queryClient = useQueryClient();
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const [saleName, setSaleName] = useState('');
  const [saleTotal, setSaleTotal] = useState('');
  const [expenseName, setExpenseName] = useState('');
  const [expenseTotal, setExpenseTotal] = useState('');
  
  

  const [showSplitModal, setShowSplitModal] = useState(false);
  const [operationManagerPercent, setOperationManagerPercent] = useState(65);
  const [generalManagerPercent, setGeneralManagerPercent] = useState(25);
  const [foodCartPercent, setFoodCartPercent] = useState(10);
  const [tempOperationPercent, setTempOperationPercent] = useState(65);
  const [tempGeneralPercent, setTempGeneralPercent] = useState(25);
  const [tempFoodCartPercent, setTempFoodCartPercent] = useState(10);
  const [includeExpenses, setIncludeExpenses] = useState(true);
  

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
  const effectiveNetSales = isNegativeNet ? 0 : splitBase;
  const operationManagerAmount = (effectiveNetSales * operationManagerPercent) / 100;
  const generalManagerAmount = (effectiveNetSales * generalManagerPercent) / 100;
  const foodCartAmount = (effectiveNetSales * foodCartPercent) / 100;

  const saveSplitPercentages = async () => {
    try {
      const totalPercent = tempOperationPercent + tempGeneralPercent + tempFoodCartPercent;
      if (totalPercent !== 100) {
        Alert.alert('Invalid Split', 'Percentages must add up to 100%');
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
    const current = type === 'operation' ? tempOperationPercent : type === 'general' ? tempGeneralPercent : tempFoodCartPercent;
    const newValue = Math.max(0, Math.min(100, current + delta));
    
    if (type === 'operation') setTempOperationPercent(newValue);
    else if (type === 'general') setTempGeneralPercent(newValue);
    else setTempFoodCartPercent(newValue);
    
    Haptics.selectionAsync();
  };

  const openSplitModal = () => {
    setTempOperationPercent(operationManagerPercent);
    setTempGeneralPercent(generalManagerPercent);
    setTempFoodCartPercent(foodCartPercent);
    setShowSplitModal(true);
  };

  const createSaleMutation = useMutation({
    mutationFn: (data: { name: string; total: number }) => 
      createSale({ ...data, date: dateStr, createdBy: user?.id || '' }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      if (user) {
        await createActivity({
          type: 'sale_add',
          description: 'New Sale posted',
          userId: user.id,
        });
        queryClient.invalidateQueries({ queryKey: ['activities'] });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const createExpenseMutation = useMutation({
    mutationFn: (data: { name: string; total: number }) => 
      createExpense({ ...data, date: dateStr, createdBy: user?.id || '' }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      if (user) {
        await createActivity({
          type: 'expense_add',
          description: 'New Expense added',
          userId: user.id,
        });
        queryClient.invalidateQueries({ queryKey: ['activities'] });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteSaleMutation = useMutation({
    mutationFn: async (id: string) => {
      queueDeletion('sales', id);
      return deleteSale(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      queueDeletion('expenses', id);
      return deleteExpense(id);
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
    if (!saleName.trim() || !saleTotal) return;
    await createSaleMutation.mutateAsync({
      name: saleName.trim(),
      total: parseFloat(saleTotal),
    });
    setSaleName('');
    setSaleTotal('');
    setShowSaleModal(false);
  };

  const handleAddExpense = async () => {
    if (!expenseName.trim() || !expenseTotal) return;
    await createExpenseMutation.mutateAsync({
      name: expenseName.trim(),
      total: parseFloat(expenseTotal),
    });
    setExpenseName('');
    setExpenseTotal('');
    setShowExpenseModal(false);
  };

  const handleDeleteSale = (id: string, name: string) => {
    if (Platform.OS === 'web') {
      if (confirm(`Delete sale "${name}"?`)) {
        deleteSaleMutation.mutate(id);
      }
    } else {
      Alert.alert('Delete Sale', `Delete "${name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteSaleMutation.mutate(id) },
      ]);
    }
  };

  const handleDeleteExpense = (id: string, name: string) => {
    if (Platform.OS === 'web') {
      if (confirm(`Delete expense "${name}"?`)) {
        deleteExpenseMutation.mutate(id);
      }
    } else {
      Alert.alert('Delete Expense', `Delete "${name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteExpenseMutation.mutate(id) },
      ]);
    }
  };

  const handleCalendarConfirm = (date: Date) => {
    setSelectedDate(date);
    setShowCalendar(false);
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
      
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.divider }]}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Sales</Text>
          <TouchableOpacity
            style={[styles.calendarButton, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            onPress={() => setShowCalendar(true)}
          >
            <Calendar color={theme.primary} size={20} />
          </TouchableOpacity>
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
          contentContainerStyle={styles.contentContainer}
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
          {sales.map(sale => (
            <View key={sale.id} style={[styles.itemCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: theme.text }]}>{sale.name}</Text>
                <Text style={[styles.itemAmount, { color: theme.success }]}>{formatCurrency(sale.total)}</Text>
              </View>
              <TouchableOpacity
                style={[styles.deleteButton, { backgroundColor: theme.error + '20' }]}
                onPress={() => handleDeleteSale(sale.id, sale.name)}
              >
                <Trash2 color={theme.error} size={18} />
              </TouchableOpacity>
            </View>
          ))}
          {sales.length === 0 && (
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No sales for this date</Text>
          )}

          <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 24 }]}>Expenses ({expenses.length})</Text>
          {expenses.map(expense => (
            <View key={expense.id} style={[styles.itemCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: theme.text }]}>{expense.name}</Text>
                <Text style={[styles.itemAmount, { color: theme.error }]}>{formatCurrency(expense.total)}</Text>
              </View>
              <TouchableOpacity
                style={[styles.deleteButton, { backgroundColor: theme.error + '20' }]}
                onPress={() => handleDeleteExpense(expense.id, expense.name)}
              >
                <Trash2 color={theme.error} size={18} />
              </TouchableOpacity>
            </View>
          ))}
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
          <View style={[styles.formModal, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Add New Sale</Text>
              <TouchableOpacity onPress={() => { setShowSaleModal(false); setSaleName(''); setSaleTotal(''); }}>
                <X color={theme.textMuted} size={24} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.formContent}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Name</Text>
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
            </View>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.cardBorder }]}
                onPress={() => { setShowSaleModal(false); setSaleName(''); setSaleTotal(''); }}
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
          </View>
        </View>
      </Modal>

      <Modal visible={showExpenseModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.formModal, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Add New Expense</Text>
              <TouchableOpacity onPress={() => { setShowExpenseModal(false); setExpenseName(''); setExpenseTotal(''); }}>
                <X color={theme.textMuted} size={24} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.formContent}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                placeholder="Expense description"
                placeholderTextColor={theme.textMuted}
                value={expenseName}
                onChangeText={setExpenseName}
              />
              
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Total (₱)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                placeholder="0.00"
                placeholderTextColor={theme.textMuted}
                value={expenseTotal}
                onChangeText={setExpenseTotal}
                keyboardType="decimal-pad"
              />
            </View>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.cardBorder }]}
                onPress={() => { setShowExpenseModal(false); setExpenseName(''); setExpenseTotal(''); }}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.error }]}
                onPress={handleAddExpense}
              >
                <Text style={styles.submitButtonText}>Add Expense</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
                Total must equal 100%. Current: {tempOperationPercent + tempGeneralPercent + tempFoodCartPercent}%
              </Text>

              {/* Operation Manager */}
              <View style={styles.percentageRow}>
                <View style={styles.percentageLabelRow}>
                  <View style={[styles.splitDot, { backgroundColor: '#4CAF50' }]} />
                  <Text style={[styles.percentageLabel, { color: theme.text }]}>Operation Manager</Text>
                </View>
                <View style={styles.percentageControls}>
                  <TouchableOpacity
                    style={[styles.percentageButton, { backgroundColor: theme.error + '20' }]}
                    onPress={() => adjustPercentage('operation', -5)}
                  >
                    <Text style={[styles.percentageButtonText, { color: theme.error }]}>-5</Text>
                  </TouchableOpacity>
                  <Text style={[styles.percentageValue, { color: theme.text }]}>{tempOperationPercent}%</Text>
                  <TouchableOpacity
                    style={[styles.percentageButton, { backgroundColor: theme.success + '20' }]}
                    onPress={() => adjustPercentage('operation', 5)}
                  >
                    <Text style={[styles.percentageButtonText, { color: theme.success }]}>+5</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* General Manager */}
              <View style={styles.percentageRow}>
                <View style={styles.percentageLabelRow}>
                  <View style={[styles.splitDot, { backgroundColor: '#2196F3' }]} />
                  <Text style={[styles.percentageLabel, { color: theme.text }]}>General Manager</Text>
                </View>
                <View style={styles.percentageControls}>
                  <TouchableOpacity
                    style={[styles.percentageButton, { backgroundColor: theme.error + '20' }]}
                    onPress={() => adjustPercentage('general', -5)}
                  >
                    <Text style={[styles.percentageButtonText, { color: theme.error }]}>-5</Text>
                  </TouchableOpacity>
                  <Text style={[styles.percentageValue, { color: theme.text }]}>{tempGeneralPercent}%</Text>
                  <TouchableOpacity
                    style={[styles.percentageButton, { backgroundColor: theme.success + '20' }]}
                    onPress={() => adjustPercentage('general', 5)}
                  >
                    <Text style={[styles.percentageButtonText, { color: theme.success }]}>+5</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Food Cart */}
              <View style={styles.percentageRow}>
                <View style={styles.percentageLabelRow}>
                  <View style={[styles.splitDot, { backgroundColor: '#FF9800' }]} />
                  <Text style={[styles.percentageLabel, { color: theme.text }]}>Food Cart</Text>
                </View>
                <View style={styles.percentageControls}>
                  <TouchableOpacity
                    style={[styles.percentageButton, { backgroundColor: theme.error + '20' }]}
                    onPress={() => adjustPercentage('foodCart', -5)}
                  >
                    <Text style={[styles.percentageButtonText, { color: theme.error }]}>-5</Text>
                  </TouchableOpacity>
                  <Text style={[styles.percentageValue, { color: theme.text }]}>{tempFoodCartPercent}%</Text>
                  <TouchableOpacity
                    style={[styles.percentageButton, { backgroundColor: theme.success + '20' }]}
                    onPress={() => adjustPercentage('foodCart', 5)}
                  >
                    <Text style={[styles.percentageButtonText, { color: theme.success }]}>+5</Text>
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
                  { backgroundColor: (tempOperationPercent + tempGeneralPercent + tempFoodCartPercent) === 100 ? theme.primary : theme.textMuted }
                ]}
                onPress={saveSplitPercentages}
                disabled={(tempOperationPercent + tempGeneralPercent + tempFoodCartPercent) !== 100}
              >
                <Save color="#fff" size={18} />
                <Text style={styles.submitButtonText}>Save</Text>
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
    paddingBottom: 100,
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
  formModal: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    overflow: 'hidden',
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
});
