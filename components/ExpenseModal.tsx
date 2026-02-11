import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Platform,
  KeyboardAvoidingView,
  FlatList,
} from 'react-native';
import { X } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { ExpenseItem, formatCurrency, generateId } from '@/types';

type Theme = typeof Colors.light;

interface ExpenseModalProps {
  visible: boolean;
  theme: Theme;
  onClose: () => void;
  onSubmit: (payload: { name: string; total: number; items: ExpenseItem[] }) => Promise<void>;
}

interface ExpenseItemRowProps {
  item: ExpenseItem;
  theme: Theme;
  disabled: boolean;
  onRemove: (id: string) => void;
}

const ExpenseItemRow = memo(({ item, theme, disabled, onRemove }: ExpenseItemRowProps) => {
  const handleRemove = useCallback(() => {
    onRemove(item.id);
  }, [item.id, onRemove]);

  return (
    <View style={[styles.itemsListItem, { borderColor: theme.cardBorder }]}>
      <Text style={[styles.itemsListText, { color: theme.text }]}>
        {item.name}
        {typeof item.price === 'number' ? ` (${formatCurrency(item.price)})` : ''}
      </Text>
      <TouchableOpacity
        style={styles.itemsRemoveButton}
        onPress={handleRemove}
        disabled={disabled}
      >
        <X color={theme.textMuted} size={16} />
      </TouchableOpacity>
    </View>
  );
});

ExpenseItemRow.displayName = 'ExpenseItemRow';

export default function ExpenseModal({ visible, theme, onClose, onSubmit }: ExpenseModalProps) {
  const [expenseName, setExpenseName] = useState('');
  const [expenseTotal, setExpenseTotal] = useState('');
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([]);
  const [expenseItemNameInput, setExpenseItemNameInput] = useState('');
  const [expenseItemPriceInput, setExpenseItemPriceInput] = useState('');
  const [validationError, setValidationError] = useState('');

  const expenseItemsTotal = useMemo(() => {
    return expenseItems.reduce((sum, item) => {
      return sum + (typeof item.price === 'number' ? item.price : 0);
    }, 0);
  }, [expenseItems]);

  const isExpenseTotalLocked = expenseItemsTotal > 0;
  const isExpenseItemsLocked = !isExpenseTotalLocked && expenseTotal.trim() !== '';

  useEffect(() => {
    if (expenseItemsTotal > 0) {
      setExpenseTotal(expenseItemsTotal.toFixed(2));
    }
  }, [expenseItemsTotal]);

  const resetForm = useCallback(() => {
    setExpenseName('');
    setExpenseTotal('');
    setExpenseItems([]);
    setExpenseItemNameInput('');
    setExpenseItemPriceInput('');
    setValidationError('');
  }, []);

  useEffect(() => {
    if (!visible) {
      resetForm();
    } else {
      setValidationError('');
    }
  }, [resetForm, visible]);

  const handleAddItem = useCallback(() => {
    if (isExpenseItemsLocked) return;
    const trimmed = expenseItemNameInput.trim();
    if (!trimmed) {
      setValidationError('Enter an item name before adding.');
      return;
    }
    const priceValue = expenseItemPriceInput.trim();
    const parsedPrice = priceValue ? Number.parseFloat(priceValue) : null;
    const normalizedPrice = parsedPrice !== null && !Number.isNaN(parsedPrice) ? parsedPrice : null;
    setExpenseItems(prev => [
      ...prev,
      { id: generateId(), name: trimmed, price: normalizedPrice },
    ]);
    setExpenseItemNameInput('');
    setExpenseItemPriceInput('');
    setValidationError('');
  }, [expenseItemNameInput, expenseItemPriceInput, isExpenseItemsLocked]);

  const handleRemoveItem = useCallback((id: string) => {
    setExpenseItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const handleSubmit = useCallback(async () => {
    const manualTotal = parseFloat(expenseTotal);
    const hasManualTotal = !Number.isNaN(manualTotal) && manualTotal > 0;
    const hasPricedItems = expenseItemsTotal > 0;
    if (!hasPricedItems && !hasManualTotal) {
      setValidationError('Add a total or at least one priced item.');
      return;
    }
    const totalValue = hasPricedItems ? Number(expenseItemsTotal.toFixed(2)) : manualTotal;
    try {
      await onSubmit({
        name: expenseName.trim(),
        total: totalValue,
        items: expenseItems,
      });
      resetForm();
      onClose();
    } catch (error) {
      setValidationError('Unable to save expense. Please try again.');
    }
  }, [expenseItems, expenseItemsTotal, expenseName, expenseTotal, onClose, onSubmit, resetForm]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const renderItem = useCallback(
    ({ item }: { item: ExpenseItem }) => (
      <ExpenseItemRow
        item={item}
        theme={theme}
        disabled={isExpenseItemsLocked}
        onRemove={handleRemoveItem}
      />
    ),
    [handleRemoveItem, isExpenseItemsLocked, theme],
  );

  const listHeader = useMemo(() => {
    return (
      <View>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>Add New Expense</Text>
          <TouchableOpacity onPress={handleClose}>
            <X color={theme.textMuted} size={24} />
          </TouchableOpacity>
        </View>

        <View style={styles.formContent}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Name (optional)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
            placeholder="Expense description"
            placeholderTextColor={theme.textMuted}
            value={expenseName}
            onChangeText={setExpenseName}
          />

          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Total (₱)</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text },
              isExpenseTotalLocked && styles.inputDisabled,
            ]}
            placeholder="0.00"
            placeholderTextColor={theme.textMuted}
            value={expenseTotal}
            onChangeText={setExpenseTotal}
            keyboardType="decimal-pad"
            editable={!isExpenseTotalLocked}
          />
          {isExpenseTotalLocked && (
            <Text style={[styles.helperText, { color: theme.textMuted }]}>Total calculated from items.</Text>
          )}

          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Items (optional)</Text>
          <View style={styles.itemsInputRow}>
            <TextInput
              style={[
                styles.itemsInput,
                { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text },
                isExpenseItemsLocked && styles.inputDisabled,
              ]}
              placeholder="Item name"
              placeholderTextColor={theme.textMuted}
              value={expenseItemNameInput}
              onChangeText={setExpenseItemNameInput}
              editable={!isExpenseItemsLocked}
            />
            <TextInput
              style={[
                styles.itemsPriceInput,
                { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text },
                isExpenseItemsLocked && styles.inputDisabled,
              ]}
              placeholder="₱0.00"
              placeholderTextColor={theme.textMuted}
              value={expenseItemPriceInput}
              onChangeText={setExpenseItemPriceInput}
              keyboardType="decimal-pad"
              editable={!isExpenseItemsLocked}
            />
            <TouchableOpacity
              style={[
                styles.itemsAddButton,
                { backgroundColor: theme.primary, opacity: isExpenseItemsLocked ? 0.5 : 1 },
              ]}
              onPress={handleAddItem}
              disabled={isExpenseItemsLocked}
            >
              <Text style={styles.itemsAddButtonText}>Add Item</Text>
            </TouchableOpacity>
          </View>
          {isExpenseItemsLocked && (
            <Text style={[styles.helperText, { color: theme.textMuted }]}>Clear Total to enter item prices.</Text>
          )}
        </View>
      </View>
    );
  }, [
    expenseItemNameInput,
    expenseItemPriceInput,
    expenseName,
    expenseTotal,
    handleAddItem,
    handleClose,
    isExpenseItemsLocked,
    isExpenseTotalLocked,
    theme,
  ]);

  const listFooter = useMemo(() => {
    return (
      <View style={styles.footerContainer}>
        {validationError ? (
          <Text style={[styles.helperText, { color: theme.error }]}>{validationError}</Text>
        ) : null}
        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={[styles.cancelButton, { borderColor: theme.cardBorder }]}
            onPress={handleClose}
          >
            <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: theme.error }]}
            onPress={handleSubmit}
          >
            <Text style={styles.submitButtonText}>Add Expense</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [handleClose, handleSubmit, theme, validationError]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        >
          <View style={[styles.formModal, { backgroundColor: theme.card }]}>
            <FlatList
              data={expenseItems}
              keyExtractor={item => item.id}
              renderItem={renderItem}
              ListHeaderComponent={listHeader}
              ListFooterComponent={listFooter}
              contentContainerStyle={styles.formScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardAvoidingView: {
    width: '100%',
    alignItems: 'center',
  },
  formModal: {
    width: '90%',
    borderRadius: 16,
    maxHeight: '90%',
  },
  formScrollContent: {
    padding: 20,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  formContent: {
    gap: 12,
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
  },
  itemsInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  itemsInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  itemsPriceInput: {
    width: 90,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  itemsAddButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  itemsAddButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  itemsListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  itemsListText: {
    fontSize: 14,
    flex: 1,
  },
  itemsRemoveButton: {
    padding: 4,
  },
  footerContainer: {
    marginTop: 12,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
  },
  cancelButtonText: {
    fontWeight: '600',
  },
  submitButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
