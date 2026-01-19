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
import { Plus, Edit2, Trash2, X, ChevronDown } from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { useSync } from '@/contexts/SyncContext';
import { Colors } from '@/constants/colors';
import { 
  Category, InventoryItem, UnitType, UNITS, formatCurrency 
} from '@/types';
import { 
  getCategories, getInventory, createCategory, deleteCategory,
  createInventoryItem, updateInventoryItem, deleteInventoryItem,
  getCategoryItemCount, createActivity
} from '@/services/database';

export default function InventoryScreen() {
  const { user, settings } = useAuth();
  const { queueDeletion } = useSync();
  const theme = settings.darkMode ? Colors.dark : Colors.light;
  const queryClient = useQueryClient();
  
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState<string | null>(null);
  const [itemUnit, setItemUnit] = useState<UnitType>('pcs');
  const [itemPrice, setItemPrice] = useState('');
  const [itemQuantity, setItemQuantity] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const { data: categories = [], refetch: refetchCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  });

  const { data: inventory = [], refetch: refetchInventory } = useQuery({
    queryKey: ['inventory'],
    queryFn: getInventory,
  });

  const filteredInventory = selectedCategory 
    ? inventory.filter(i => i.categoryId === selectedCategory)
    : inventory;

  const createItemMutation = useMutation({
    mutationFn: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => 
      createInventoryItem(item),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      if (user) {
        await createActivity({
          type: 'inventory_add',
          description: 'Added new item to Inventory',
          userId: user.id,
        });
        queryClient.invalidateQueries({ queryKey: ['activities'] });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: (item: InventoryItem) => updateInventoryItem(item),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      if (user) {
        await createActivity({
          type: 'inventory_update',
          description: 'Updated inventory item',
          userId: user.id,
        });
        queryClient.invalidateQueries({ queryKey: ['activities'] });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      queueDeletion('inventory', id);
      return deleteInventoryItem(id);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      if (user) {
        await createActivity({
          type: 'inventory_delete',
          description: 'Deleted inventory item',
          userId: user.id,
        });
        queryClient.invalidateQueries({ queryKey: ['activities'] });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setNewCategoryName('');
      setShowCategoryModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      queueDeletion('categories', id);
      return deleteCategory(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      if (selectedCategory === editingItem?.categoryId) {
        setSelectedCategory(null);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchCategories(), refetchInventory()]);
    setRefreshing(false);
  }, [refetchCategories, refetchInventory]);

  const resetForm = () => {
    setItemName('');
    setItemCategory(null);
    setItemUnit('pcs');
    setItemPrice('');
    setItemQuantity('');
  };

  const handleAddItem = async () => {
    if (!itemName.trim() || !itemPrice || !itemQuantity || !user) return;
    
    await createItemMutation.mutateAsync({
      name: itemName.trim(),
      categoryId: itemCategory,
      unit: itemUnit,
      price: parseFloat(itemPrice),
      quantity: parseFloat(itemQuantity),
      createdBy: user.id,
    });
    
    resetForm();
    setShowAddModal(false);
  };

  const handleEditItem = async () => {
    if (!editingItem || !itemName.trim() || !itemPrice || !itemQuantity) return;
    
    await updateItemMutation.mutateAsync({
      ...editingItem,
      name: itemName.trim(),
      categoryId: itemCategory,
      unit: itemUnit,
      price: parseFloat(itemPrice),
      quantity: parseFloat(itemQuantity),
    });
    
    resetForm();
    setEditingItem(null);
    setShowEditModal(false);
  };

  const handleDeleteItem = (item: InventoryItem) => {
    if (Platform.OS === 'web') {
      if (confirm(`Delete "${item.name}"?`)) {
        deleteItemMutation.mutate(item.id);
      }
    } else {
      Alert.alert(
        'Delete Item',
        `Are you sure you want to delete "${item.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => deleteItemMutation.mutate(item.id) },
        ]
      );
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    const count = await getCategoryItemCount(category.id);
    if (count > 0) {
      if (Platform.OS === 'web') {
        alert('Cannot delete category with items. Remove all items first.');
      } else {
        Alert.alert('Cannot Delete', 'Remove all items from this category first.');
      }
      return;
    }
    
    if (Platform.OS === 'web') {
      if (confirm(`Delete category "${category.name}"?`)) {
        deleteCategoryMutation.mutate(category.id);
      }
    } else {
      Alert.alert(
        'Delete Category',
        `Are you sure you want to delete "${category.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => deleteCategoryMutation.mutate(category.id) },
        ]
      );
    }
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemCategory(item.categoryId);
    setItemUnit(item.unit);
    setItemPrice(item.price.toString());
    setItemQuantity(item.quantity.toString());
    setShowEditModal(true);
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return 'None';
    const category = categories.find(c => c.id === categoryId);
    return category?.name || 'None';
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={[theme.backgroundGradientStart, theme.backgroundGradientEnd]}
        style={StyleSheet.absoluteFill}
      />
      
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.tabsContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
          >
            <TouchableOpacity
              style={[
                styles.tab,
                { borderColor: theme.cardBorder },
                !selectedCategory && { backgroundColor: theme.primary + '30', borderColor: theme.primary },
              ]}
              onPress={() => setSelectedCategory(null)}
            >
              <Text style={[
                styles.tabText,
                { color: !selectedCategory ? theme.primary : theme.textSecondary },
              ]}>
                All
              </Text>
            </TouchableOpacity>
            
            {categories.map(category => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.tab,
                  { borderColor: theme.cardBorder },
                  selectedCategory === category.id && { backgroundColor: theme.primary + '30', borderColor: theme.primary },
                ]}
                onPress={() => setSelectedCategory(category.id)}
                onLongPress={() => handleDeleteCategory(category)}
              >
                <Text style={[
                  styles.tabText,
                  { color: selectedCategory === category.id ? theme.primary : theme.textSecondary },
                ]}>
                  {category.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={() => setShowAddModal(true)}
        >
          <Plus color="#fff" size={20} />
          <Text style={styles.addButtonText}>Add Item</Text>
        </TouchableOpacity>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
        >
          {filteredInventory.map(item => (
            <View 
              key={item.id} 
              style={[styles.itemCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            >
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: theme.text }]}>{item.name}</Text>
                <Text style={[styles.itemDetails, { color: theme.textSecondary }]}>
                  {getCategoryName(item.categoryId)} • {item.quantity} {item.unit} • {formatCurrency(item.price)}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <TouchableOpacity
                  style={[styles.iconButton, { backgroundColor: theme.primary + '20' }]}
                  onPress={() => openEditModal(item)}
                >
                  <Edit2 color={theme.primary} size={18} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconButton, { backgroundColor: theme.error + '20' }]}
                  onPress={() => handleDeleteItem(item)}
                >
                  <Trash2 color={theme.error} size={18} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          
          {filteredInventory.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No items in inventory
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={showAddModal || showEditModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {showEditModal ? 'Edit Inventory Item' : 'Add Inventory Item'}
              </Text>
              <TouchableOpacity onPress={() => {
                resetForm();
                setEditingItem(null);
                setShowAddModal(false);
                setShowEditModal(false);
              }}>
                <X color={theme.textMuted} size={24} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBodyContent}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Storage Category</Text>
              <View style={styles.categorySelectRow}>
                <TouchableOpacity
                  style={[styles.selectButton, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}
                  onPress={() => setShowCategoryPicker(!showCategoryPicker)}
                >
                  <Text style={[styles.selectText, { color: theme.text }]}>
                    {getCategoryName(itemCategory)}
                  </Text>
                  <ChevronDown color={theme.textMuted} size={20} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addCategoryButton, { backgroundColor: theme.primary }]}
                  onPress={() => setShowCategoryModal(true)}
                >
                  <Plus color="#fff" size={20} />
                </TouchableOpacity>
              </View>
              
              {showCategoryPicker && (
                <View style={[styles.pickerDropdown, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
                  <TouchableOpacity
                    style={styles.pickerOption}
                    onPress={() => { setItemCategory(null); setShowCategoryPicker(false); }}
                  >
                    <Text style={[styles.pickerOptionText, { color: theme.text }]}>None</Text>
                  </TouchableOpacity>
                  {categories.map(cat => (
                    <TouchableOpacity
                      key={cat.id}
                      style={styles.pickerOption}
                      onPress={() => { setItemCategory(cat.id); setShowCategoryPicker(false); }}
                    >
                      <Text style={[styles.pickerOptionText, { color: theme.text }]}>{cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Item Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                placeholder="Enter item name"
                placeholderTextColor={theme.textMuted}
                value={itemName}
                onChangeText={setItemName}
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Unit</Text>
              <TouchableOpacity
                style={[styles.selectButton, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}
                onPress={() => setShowUnitPicker(!showUnitPicker)}
              >
                <Text style={[styles.selectText, { color: theme.text }]}>{itemUnit}</Text>
                <ChevronDown color={theme.textMuted} size={20} />
              </TouchableOpacity>
              
              {showUnitPicker && (
                <View style={[styles.pickerDropdown, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
                  {UNITS.map(unit => (
                    <TouchableOpacity
                      key={unit}
                      style={styles.pickerOption}
                      onPress={() => { setItemUnit(unit); setShowUnitPicker(false); }}
                    >
                      <Text style={[styles.pickerOptionText, { color: theme.text }]}>{unit}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Price (₱)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                placeholder="0.00"
                placeholderTextColor={theme.textMuted}
                value={itemPrice}
                onChangeText={setItemPrice}
                keyboardType="decimal-pad"
              />

              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Current Quantity</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                placeholder="0"
                placeholderTextColor={theme.textMuted}
                value={itemQuantity}
                onChangeText={setItemQuantity}
                keyboardType="decimal-pad"
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.cardBorder }]}
                onPress={() => {
                  resetForm();
                  setEditingItem(null);
                  setShowAddModal(false);
                  setShowEditModal(false);
                }}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={showEditModal ? handleEditItem : handleAddItem}
              >
                <Text style={styles.submitButtonText}>{showEditModal ? 'Save' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCategoryModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, maxHeight: 250 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Add Category</Text>
              <TouchableOpacity onPress={() => { setShowCategoryModal(false); setNewCategoryName(''); }}>
                <X color={theme.textMuted} size={24} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, color: theme.text }]}
                placeholder="Category name"
                placeholderTextColor={theme.textMuted}
                value={newCategoryName}
                onChangeText={setNewCategoryName}
              />
            </View>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: theme.cardBorder }]}
                onPress={() => { setShowCategoryModal(false); setNewCategoryName(''); }}
              >
                <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: theme.primary }]}
                onPress={() => newCategoryName.trim() && createCategoryMutation.mutate(newCategoryName.trim())}
              >
                <Text style={styles.submitButtonText}>Add</Text>
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
  tabsContainer: {
    paddingTop: 8,
  },
  tabsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginVertical: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  itemDetails: {
    fontSize: 13,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
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
  modalBody: {
    padding: 20,
    maxHeight: 350,
  },
  modalBodyContent: {
    paddingBottom: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  categorySelectRow: {
    flexDirection: 'row',
    gap: 8,
  },
  selectButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: {
    fontSize: 16,
  },
  addCategoryButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerDropdown: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    overflow: 'hidden',
  },
  pickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  pickerOptionText: {
    fontSize: 16,
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
