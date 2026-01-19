import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { X, Package, ShoppingCart, User, Settings } from 'lucide-react-native';
import { Activity, ActivityType } from '@/types';
import { Colors } from '@/constants/colors';

interface UpdateDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  activity: Activity | null;
  authorName: string;
  darkMode: boolean;
}

function getActivityIcon(type: ActivityType, color: string) {
  switch (type) {
    case 'inventory_add':
    case 'inventory_update':
    case 'inventory_delete':
      return <Package color={color} size={24} />;
    case 'sale_add':
    case 'expense_add':
      return <ShoppingCart color={color} size={24} />;
    case 'profile_update':
      return <User color={color} size={24} />;
    case 'settings_change':
      return <Settings color={color} size={24} />;
    default:
      return <Package color={color} size={24} />;
  }
}

function getActivityTypeLabel(type: ActivityType): string {
  switch (type) {
    case 'inventory_add':
      return 'Inventory Added';
    case 'inventory_update':
      return 'Inventory Updated';
    case 'inventory_delete':
      return 'Inventory Deleted';
    case 'sale_add':
      return 'Sale Recorded';
    case 'expense_add':
      return 'Expense Recorded';
    case 'profile_update':
      return 'Profile Updated';
    case 'settings_change':
      return 'Settings Changed';
    default:
      return 'Update';
  }
}

function getWhatChangedText(activity: Activity): string {
  switch (activity.type) {
    case 'inventory_add':
      return 'A new item was added to the inventory. This item is now available for tracking and can be used in sales records.';
    case 'inventory_update':
      return 'An existing inventory item was modified. Changes may include quantity adjustments, price updates, or category changes.';
    case 'inventory_delete':
      return 'An inventory item was removed from the system. All associated records remain for historical purposes.';
    case 'sale_add':
      return 'A new sale transaction was recorded. This contributes to the daily sales total and revenue tracking.';
    case 'expense_add':
      return 'A new expense was logged. This will be reflected in the daily expenses and profit calculations.';
    case 'profile_update':
      return 'User profile information was updated. Changes may include name, display settings, or other personal details.';
    case 'settings_change':
      return 'Application settings were modified. This may affect how the app behaves or displays information.';
    default:
      return 'A system update was made.';
  }
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function UpdateDetailsModal({
  visible,
  onClose,
  activity,
  authorName,
  darkMode,
}: UpdateDetailsModalProps) {
  const theme = darkMode ? Colors.dark : Colors.light;
  const { width: screenWidth } = useWindowDimensions();
  const modalWidth = Math.min(520, screenWidth * 0.92);

  if (!activity) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable 
          style={[
            styles.modalContainer,
            { 
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
              width: modalWidth,
            }
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.header, { borderBottomColor: theme.divider }]}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Update Details</Text>
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: theme.cardHighlight }]}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X color={theme.textSecondary} size={20} />
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.typeCard, { backgroundColor: theme.cardHighlight }]}>
              <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
                {getActivityIcon(activity.type, theme.primary)}
              </View>
              <View style={styles.typeInfo}>
                <Text style={[styles.typeLabel, { color: theme.primary }]}>
                  {getActivityTypeLabel(activity.type)}
                </Text>
                <Text style={[styles.description, { color: theme.text }]}>
                  {activity.description}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>What Changed</Text>
              <View style={[styles.sectionCard, { backgroundColor: theme.cardHighlight, borderColor: theme.cardBorder }]}>
                <Text style={[styles.sectionText, { color: theme.textSecondary }]}>
                  {getWhatChangedText(activity)}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Details</Text>
              <View style={[styles.detailsCard, { backgroundColor: theme.cardHighlight, borderColor: theme.cardBorder }]}>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Posted by</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>{authorName}</Text>
                </View>
                <View style={[styles.detailDivider, { backgroundColor: theme.divider }]} />
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Date & Time</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>
                    {formatDateTime(activity.createdAt)}
                  </Text>
                </View>
                <View style={[styles.detailDivider, { backgroundColor: theme.divider }]} />
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Activity ID</Text>
                  <Text style={[styles.detailValueSmall, { color: theme.textMuted }]} numberOfLines={1}>
                    {activity.id}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    borderRadius: 20,
    borderWidth: 1,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  typeInfo: {
    flex: 1,
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  description: {
    fontSize: 16,
    fontWeight: '500' as const,
    lineHeight: 22,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    marginBottom: 10,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionText: {
    fontSize: 14,
    lineHeight: 22,
  },
  detailsCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500' as const,
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  detailValueSmall: {
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  detailDivider: {
    height: 1,
    marginHorizontal: 16,
  },
});
