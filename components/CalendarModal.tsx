import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '@/constants/colors';
import { getEntryDaysForMonth } from '@/services/database';

interface CalendarModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  initialDate: Date;
  theme: ThemeColors;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MODAL_MAX_WIDTH = 420;
const MODAL_WIDTH = Math.min(MODAL_MAX_WIDTH, SCREEN_WIDTH * 0.92);

export default function CalendarModal({
  visible,
  onClose,
  onConfirm,
  initialDate,
  theme,
}: CalendarModalProps) {
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [entryDays, setEntryDays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const today = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  const loadEntryDays = useCallback(async (year: number, month: number) => {
    setLoading(true);
    try {
      const days = await getEntryDaysForMonth(year, month + 1);
      setEntryDays(new Set(days));
    } catch (error) {
      console.log('Error loading entry days:', error);
      setEntryDays(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setViewYear(initialDate.getFullYear());
      setViewMonth(initialDate.getMonth());
      setSelectedDate(initialDate);
      loadEntryDays(initialDate.getFullYear(), initialDate.getMonth());
    }
  }, [visible, initialDate, loadEntryDays]);

  useEffect(() => {
    if (visible) {
      loadEntryDays(viewYear, viewMonth);
    }
  }, [viewYear, viewMonth, visible, loadEntryDays]);

  const handlePrevMonth = useCallback(() => {
    Haptics.selectionAsync();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }, [viewMonth, viewYear]);

  const handleNextMonth = useCallback(() => {
    Haptics.selectionAsync();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }, [viewMonth, viewYear]);

  const handleDayPress = useCallback((day: number) => {
    Haptics.selectionAsync();
    setSelectedDate(new Date(viewYear, viewMonth, day));
  }, [viewYear, viewMonth]);

  const handleConfirm = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm(selectedDate);
  }, [selectedDate, onConfirm]);

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    
    const days: (number | null)[] = [];
    
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    while (days.length % 7 !== 0) {
      days.push(null);
    }
    
    return days;
  }, [viewYear, viewMonth]);

  const getDateString = useCallback((day: number) => {
    const monthStr = String(viewMonth + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return `${viewYear}-${monthStr}-${dayStr}`;
  }, [viewYear, viewMonth]);

  const isSelectedDay = useCallback((day: number) => {
    return (
      selectedDate.getFullYear() === viewYear &&
      selectedDate.getMonth() === viewMonth &&
      selectedDate.getDate() === day
    );
  }, [selectedDate, viewYear, viewMonth]);

  const isToday = useCallback((day: number) => {
    return getDateString(day) === today;
  }, [getDateString, today]);

  const hasEntry = useCallback((day: number) => {
    return entryDays.has(getDateString(day));
  }, [entryDays, getDateString]);

  const renderDay = useCallback((day: number | null, index: number) => {
    if (day === null) {
      return <View key={`empty-${index}`} style={styles.dayCell} />;
    }

    const selected = isSelectedDay(day);
    const todayMark = isToday(day);
    const withEntry = hasEntry(day);

    return (
      <TouchableOpacity
        key={`day-${day}`}
        style={[
          styles.dayCell,
          selected && [styles.selectedDay, { backgroundColor: theme.primary }],
          todayMark && !selected && [styles.todayDay, { borderColor: theme.primary }],
        ]}
        onPress={() => handleDayPress(day)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.dayText,
            selected
              ? styles.selectedDayText
              : withEntry
                ? [styles.entryDayText, { color: theme.success }]
                : [styles.noEntryDayText, { color: theme.error }],
          ]}
        >
          {day}
        </Text>
      </TouchableOpacity>
    );
  }, [isSelectedDay, isToday, hasEntry, handleDayPress, theme]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.overlay, { backgroundColor: theme.modalOverlay }]}>
        <View style={[styles.modal, { backgroundColor: theme.card, width: MODAL_WIDTH }]}>
          <View style={[styles.header, { borderBottomColor: theme.divider }]}>
            <Text style={[styles.title, { color: theme.text }]}>Select Date</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X color={theme.textMuted} size={24} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={styles.monthNav}>
              <TouchableOpacity
                style={[styles.navButton, { backgroundColor: theme.inputBackground }]}
                onPress={handlePrevMonth}
              >
                <ChevronLeft color={theme.text} size={22} />
              </TouchableOpacity>
              <Text style={[styles.monthYearText, { color: theme.text }]}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </Text>
              <TouchableOpacity
                style={[styles.navButton, { backgroundColor: theme.inputBackground }]}
                onPress={handleNextMonth}
              >
                <ChevronRight color={theme.text} size={22} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekdaysRow}>
              {WEEKDAYS.map((day) => (
                <View key={day} style={styles.weekdayCell}>
                  <Text style={[styles.weekdayText, { color: theme.textSecondary }]}>{day}</Text>
                </View>
              ))}
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={theme.primary} />
              </View>
            ) : (
              <View style={styles.daysGrid}>
                {calendarDays.map((day, index) => renderDay(day, index))}
              </View>
            )}

            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.success }]} />
                <Text style={[styles.legendText, { color: theme.textSecondary }]}>Has entries</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.error }]} />
                <Text style={[styles.legendText, { color: theme.textSecondary }]}>No entries</Text>
              </View>
            </View>
          </View>

          <View style={[styles.footer, { borderTopColor: theme.divider }]}>
            <TouchableOpacity
              style={[styles.button, styles.closeButton, { borderColor: theme.cardBorder }]}
              onPress={onClose}
            >
              <Text style={[styles.closeButtonText, { color: theme.textSecondary }]}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.confirmButton, { backgroundColor: theme.primary }]}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmButtonText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modal: {
    borderRadius: 20,
    overflow: 'hidden',
    maxWidth: MODAL_MAX_WIDTH,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  content: {
    padding: 16,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthYearText: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
  loadingContainer: {
    height: 240,
    justifyContent: 'center',
    alignItems: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  dayText: {
    fontSize: 15,
    fontWeight: '500' as const,
  },
  selectedDay: {
    borderRadius: 100,
  },
  selectedDayText: {
    color: '#ffffff',
    fontWeight: '700' as const,
  },
  todayDay: {
    borderWidth: 2,
    borderRadius: 100,
  },
  entryDayText: {
    fontWeight: '600' as const,
  },
  noEntryDayText: {
    fontWeight: '400' as const,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 16,
    paddingTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    borderWidth: 1,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
  confirmButton: {},
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
