import React, { useState, useCallback } from 'react';
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
import { Calendar, Plus, X, Trash2 } from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';
import { formatCurrency, formatDate } from '@/types';
import { 
  getSalesByDate, getExpensesByDate, createSale, createExpense,
  deleteSale, deleteExpense, createActivity
} from '@/services/database';

export default function SalesScreen() {
  const { user, settings } = useAuth();
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
  
  const [calendarYear, setCalendarYear] = useState(selectedDate.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(selectedDate.getMonth());
  const [calendarDay, setCalendarDay] = useState(selectedDate.getDate());

  const dateStr = selectedDate.toISOString().split('T')[0];

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
    mutationFn: (id: string) => deleteSale(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => deleteExpense(id),
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

  const confirmCalendarDate = () => {
    setSelectedDate(new Date(calendarYear, calendarMonth, calendarDay));
    setShowCalendar(false);
  };

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={[theme.backgroundGradientStart, theme.backgroundGradientEnd]}
        style={StyleSheet.absoluteFill}
      />
      
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

      <Modal visible={showCalendar} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.calendarModal, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Select Date</Text>
              <TouchableOpacity onPress={() => setShowCalendar(false)}>
                <X color={theme.textMuted} size={24} />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarContent}>
              <Text style={[styles.pickerLabel, { color: theme.textSecondary }]}>Year</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
                {Array.from({ length: 10 }, (_, i) => 2020 + i).map(year => (
                  <TouchableOpacity
                    key={year}
                    style={[
                      styles.pickerItem,
                      { borderColor: theme.cardBorder },
                      calendarYear === year && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ]}
                    onPress={() => setCalendarYear(year)}
                  >
                    <Text style={[
                      styles.pickerItemText,
                      { color: calendarYear === year ? '#fff' : theme.text },
                    ]}>{year}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.pickerLabel, { color: theme.textSecondary }]}>Month</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
                {months.map((month, index) => (
                  <TouchableOpacity
                    key={month}
                    style={[
                      styles.pickerItem,
                      { borderColor: theme.cardBorder },
                      calendarMonth === index && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ]}
                    onPress={() => setCalendarMonth(index)}
                  >
                    <Text style={[
                      styles.pickerItemText,
                      { color: calendarMonth === index ? '#fff' : theme.text },
                    ]}>{month}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.pickerLabel, { color: theme.textSecondary }]}>Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.pickerItem,
                      { borderColor: theme.cardBorder },
                      calendarDay === day && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ]}
                    onPress={() => setCalendarDay(day)}
                  >
                    <Text style={[
                      styles.pickerItemText,
                      { color: calendarDay === day ? '#fff' : theme.text },
                    ]}>{day}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.cardBorder }]}
                onPress={() => setShowCalendar(false)}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={confirmCalendarDate}
              >
                <Text style={styles.submitButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  calendarModal: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    overflow: 'hidden',
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
  calendarContent: {
    padding: 20,
  },
  formContent: {
    padding: 20,
  },
  pickerLabel: {
    fontSize: 14,
    marginBottom: 8,
    marginTop: 12,
  },
  pickerScroll: {
    maxHeight: 50,
  },
  pickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
  },
  pickerItemText: {
    fontSize: 14,
    fontWeight: '500' as const,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
