import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ThemeColors } from '@/constants/colors';

interface WeeklyOverviewLegendProps {
  theme: ThemeColors;
  salesColor: string;
  expensesColor: string;
  omColor: string;
  gmColor: string;
  fcColor: string;
}

export default function WeeklyOverviewLegend({
  theme,
  salesColor,
  expensesColor,
  omColor,
  gmColor,
  fcColor,
}: WeeklyOverviewLegendProps) {
  const legendRows = useMemo(
    () => [
      { key: 'S', label: 'Sales', color: salesColor },
      { key: 'E', label: 'Expenses', color: expensesColor },
      { key: 'OM', label: 'Operation Manager', color: omColor },
      { key: 'GM', label: 'General Manager', color: gmColor },
      { key: 'FC', label: 'Food Cart', color: fcColor },
    ],
    [salesColor, expensesColor, omColor, gmColor, fcColor]
  );

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <Text style={[styles.title, { color: theme.text }]}>Legend</Text>
      <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
        Overview shows weekly and monthly totals by day/month.
      </Text>
      <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
        Dots represent daily totals; tiny numbers above dots show the value for that day.
      </Text>
      <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
        Colors match the chart series colors (if applicable).
      </Text>
      <View style={styles.list}>
        {legendRows.map((row) => (
          <View key={row.key} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: row.color }]} />
            <Text style={[styles.abbrev, { color: theme.text }]}>{row.key}</Text>
            <Text style={[styles.separator, { color: theme.textMuted }]}>—</Text>
            <Text style={[styles.label, { color: theme.textSecondary }]}>{row.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 4,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 6,
  },
  bodyText: {
    fontSize: 12,
    lineHeight: 18,
  },
  list: {
    marginTop: 8,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  abbrev: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  separator: {
    fontSize: 12,
  },
  label: {
    fontSize: 12,
    flexShrink: 1,
  },
});
