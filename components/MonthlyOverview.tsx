import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

type MonthlyPoint = {
  monthLabel: string;
  sales: number;
  expenses: number;
  om: number;
  gm: number;
  fc: number;
};

function formatCompactNumberNoDecimals(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000) {
    return `${value < 0 ? '-' : ''}${Math.round(absValue / 1_000_000)}M`;
  }
  if (absValue >= 1_000) {
    return `${value < 0 ? '-' : ''}${Math.round(absValue / 1_000)}k`;
  }
  return `${Math.round(value)}`;
}

function formatCurrency(value: number): string {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function MonthlyOverview({
  theme,
  year,
  points,
  selectedMonthIndex,
  onSelectMonth,
  totalsForSelectedMonth,
  colors,
}: {
  theme: any;
  year: number;
  points: MonthlyPoint[];
  selectedMonthIndex: number;
  onSelectMonth: (index: number) => void;
  totalsForSelectedMonth: {
    sales: number; expenses: number; om: number; gm: number; fc: number;
  };
  colors: {
    sales: string; expenses: string; om: string; gm: string; fc: string;
  };
}) {
  const chart = useMemo(() => {
    const chartHeight = 190;
    const chartTopPadding = 16;
    const chartBottomPadding = 28;
    const barWidth = 7;
    const barGap = 3;
    const groupGap = 14;
    const monthCount = 12;
    const barsPerGroup = 5;
    const groupInnerWidth = barsPerGroup * barWidth + (barsPerGroup - 1) * barGap;
    const groupWidth = groupInnerWidth + groupGap;
    const chartWidth = monthCount * groupWidth;
    const valueMax = Math.max(
      100,
      ...points.map(point => Math.max(point.sales, point.expenses, point.om, point.gm, point.fc))
    );

    const scaleY = (value: number) => {
      if (valueMax <= 0) return chartTopPadding + chartHeight;
      const clamped = Math.max(0, value);
      return chartTopPadding + chartHeight - (clamped / valueMax) * chartHeight;
    };

    const gridCount = 4;
    const gridLines = Array.from({ length: gridCount + 1 }, (_, index) => {
      const ratio = index / gridCount;
      return chartTopPadding + ratio * chartHeight;
    });

    return {
      chartHeight,
      chartTopPadding,
      chartBottomPadding,
      barWidth,
      barGap,
      groupGap,
      groupInnerWidth,
      groupWidth,
      chartWidth,
      scaleY,
      gridLines,
    };
  }, [points]);

  const totalCards = [
    { key: 'sales', label: 'Sales', value: totalsForSelectedMonth.sales, color: colors.sales },
    { key: 'expenses', label: 'Expenses', value: totalsForSelectedMonth.expenses, color: colors.expenses },
    { key: 'om', label: 'Operation Manager', value: totalsForSelectedMonth.om, color: colors.om },
    { key: 'gm', label: 'General Manager', value: totalsForSelectedMonth.gm, color: colors.gm },
    { key: 'fc', label: 'Food Cart', value: totalsForSelectedMonth.fc, color: colors.fc },
  ];

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Monthly Overview</Text>
        <Text style={[styles.yearText, { color: theme.textSecondary }]}>{year}</Text>
      </View>

      <View style={styles.totalsRow}>
        {totalCards.map((item) => (
          <View key={item.key} style={[styles.totalCard, { backgroundColor: `${item.color}15` }]}>
            <Text style={[styles.totalLabel, { color: theme.textMuted }]} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={[styles.totalValue, { color: item.color }]} numberOfLines={1}>
              {formatCurrency(item.value)}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScrollContent}>
        <Svg
          width={chart.chartWidth}
          height={chart.chartTopPadding + chart.chartHeight + chart.chartBottomPadding}
        >
          {chart.gridLines.map((lineY, index) => (
            <Rect
              key={`grid-${index}`}
              x={0}
              y={lineY}
              width={chart.chartWidth}
              height={1}
              fill={theme.cardBorder}
              opacity={0.5}
            />
          ))}

          {points.map((point, monthIndex) => {
            const values = [point.sales, point.expenses, point.om, point.gm, point.fc];
            const fillColors = [colors.sales, colors.expenses, colors.om, colors.gm, colors.fc];
            const groupX = monthIndex * chart.groupWidth;
            const highlightPadding = 4;
            const isSelected = monthIndex === selectedMonthIndex;

            return (
              <React.Fragment key={`${point.monthLabel}-${monthIndex}`}>
                {isSelected && (
                  <Rect
                    x={groupX - highlightPadding}
                    y={chart.chartTopPadding - 6}
                    width={chart.groupInnerWidth + highlightPadding * 2}
                    height={chart.chartHeight + 16}
                    rx={8}
                    fill={theme.primary}
                    opacity={0.08}
                  />
                )}

                {values.map((value, barIndex) => {
                  const barHeight = chart.chartHeight - (chart.scaleY(value) - chart.chartTopPadding);
                  const x = groupX + barIndex * (chart.barWidth + chart.barGap);
                  const y = chart.scaleY(value);
                  const showLabel = value > 0;

                  return (
                    <React.Fragment key={`${point.monthLabel}-${barIndex}`}>
                      <Rect
                        x={x}
                        y={y}
                        width={chart.barWidth}
                        height={Math.max(1, barHeight)}
                        rx={2}
                        fill={fillColors[barIndex]}
                      />
                      {showLabel && (
                        <SvgText
                          x={x + chart.barWidth / 2}
                          y={Math.max(10, y - 4)}
                          fontSize={8}
                          fill={theme.text}
                          textAnchor="middle"
                        >
                          {formatCompactNumberNoDecimals(value)}
                        </SvgText>
                      )}
                    </React.Fragment>
                  );
                })}

                <SvgText
                  x={groupX + chart.groupInnerWidth / 2}
                  y={chart.chartTopPadding + chart.chartHeight + 18}
                  fontSize={10}
                  textAnchor="middle"
                  fill={isSelected ? theme.text : theme.textMuted}
                  fontWeight={isSelected ? '700' : '500'}
                >
                  {point.monthLabel}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthButtonsRow}>
        {points.map((point, index) => (
          <TouchableOpacity
            key={`${point.monthLabel}-button`}
            style={[
              styles.monthButton,
              { borderColor: theme.cardBorder, width: chart.groupWidth },
              index === selectedMonthIndex && { backgroundColor: `${theme.primary}20`, borderColor: theme.primary },
            ]}
            onPress={() => onSelectMonth(index)}
          >
            <Text
              style={[
                styles.monthButtonText,
                { color: index === selectedMonthIndex ? theme.primary : theme.textMuted },
              ]}
            >
              {point.monthLabel}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  yearText: {
    fontSize: 12,
    fontWeight: '600',
  },
  totalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  totalCard: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  totalLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  totalValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  chartScrollContent: {
    paddingBottom: 2,
  },
  monthButtonsRow: {
    marginTop: 8,
    alignItems: 'center',
  },
  monthButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  monthButtonText: {
    fontSize: 10,
    fontWeight: '600',
  },
});
