import AsyncStorage from '@react-native-async-storage/async-storage';
import { Expense, ExpenseItem, Sale } from '@/types';
import { getExpensesByDateRange, getSalesByDateRange } from '@/services/database';
import { getDayKeysForWeek, getWeekRange, parseLocalDateString, toLocalDayKey } from '@/services/dateUtils';

export type PdfWeekRange = {
  start: Date;
  end: Date;
  label?: string;
};

type NetSalesSplit = {
  operation: number;
  general: number;
  foodCart: number;
  includeExp: boolean;
};

type DailySummary = {
  dateKey: string;
  sales: Sale[];
  expenses: Expense[];
  totalSales: number;
  totalExpenses: number;
  netSales: number;
  splitAmounts: SplitAmounts;
};

type SplitAmounts = {
  operation: number;
  general: number;
  foodCart: number;
  base: number;
};

type WeeklySummary = {
  range: PdfWeekRange;
  days: DailySummary[];
  totalSales: number;
  totalExpenses: number;
  netSales: number;
  splitAmounts: SplitAmounts;
};

type MonthlySummary = {
  monthLabel: string;
  totalSales: number;
  totalExpenses: number;
  netSales: number;
  topSales: Sale[];
  topExpenses: Expense[];
};

type PdfSummaryResult = {
  html: string;
  fileName: string;
};

const DEFAULT_SPLIT: NetSalesSplit = {
  operation: 65,
  general: 25,
  foodCart: 10,
  includeExp: true,
};

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(amount: number): string {
  return `₱${currencyFormatter.format(amount)}`;
}

function formatDateLabel(dateKey: string): string {
  const date = parseLocalDateString(dateKey);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeSplitValue(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

async function loadNetSalesSplit(): Promise<NetSalesSplit> {
  try {
    const stored = await AsyncStorage.getItem('netSalesSplit');
    if (!stored) return DEFAULT_SPLIT;
    const parsed = JSON.parse(stored) as Partial<NetSalesSplit>;
    return {
      operation: normalizeSplitValue(parsed.operation, DEFAULT_SPLIT.operation),
      general: normalizeSplitValue(parsed.general, DEFAULT_SPLIT.general),
      foodCart: normalizeSplitValue(parsed.foodCart, DEFAULT_SPLIT.foodCart),
      includeExp: typeof parsed.includeExp === 'boolean' ? parsed.includeExp : DEFAULT_SPLIT.includeExp,
    };
  } catch (error) {
    console.log('Error loading net sales split:', error);
    return DEFAULT_SPLIT;
  }
}

function groupByDay<T extends { date: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = toLocalDayKey(item.date);
    if (!key) continue;
    const existing = grouped.get(key) ?? [];
    existing.push(item);
    grouped.set(key, existing);
  }
  return grouped;
}

function calculateSplitAmounts(totalSales: number, totalExpenses: number, split: NetSalesSplit): SplitAmounts {
  const netSales = totalSales - totalExpenses;
  const splitBase = split.includeExp ? netSales : totalSales;
  const effectiveBase = splitBase < 0 ? 0 : splitBase;
  return {
    base: effectiveBase,
    operation: (effectiveBase * split.operation) / 100,
    general: (effectiveBase * split.general) / 100,
    foodCart: (effectiveBase * split.foodCart) / 100,
  };
}

function buildDailySummaries(dayKeys: string[], sales: Sale[], expenses: Expense[], split: NetSalesSplit): DailySummary[] {
  const salesByDay = groupByDay(sales);
  const expensesByDay = groupByDay(expenses);

  return dayKeys.map(dateKey => {
    const daySales = salesByDay.get(dateKey) ?? [];
    const dayExpenses = expensesByDay.get(dateKey) ?? [];
    const totalSales = daySales.reduce((sum, item) => sum + item.total, 0);
    const totalExpenses = dayExpenses.reduce((sum, item) => sum + item.total, 0);
    const netSales = totalSales - totalExpenses;

    return {
      dateKey,
      sales: daySales,
      expenses: dayExpenses,
      totalSales,
      totalExpenses,
      netSales,
      splitAmounts: calculateSplitAmounts(totalSales, totalExpenses, split),
    };
  });
}

function formatWeekLabel(range: PdfWeekRange): string {
  const startLabel = range.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = range.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function buildWeeklyExpensesChart(weeks: WeeklySummary[]): string {
  const width = 520;
  const height = 220;
  const padding = 30;
  const barGap = 20;
  const maxValue = Math.max(...weeks.map(week => week.totalExpenses), 1);
  const barWidth = (width - padding * 2 - barGap * (weeks.length - 1)) / weeks.length;

  const bars = weeks.map((week, index) => {
    const barHeight = ((week.totalExpenses || 0) / maxValue) * (height - padding * 2);
    const x = padding + index * (barWidth + barGap);
    const y = height - padding - barHeight;
    return `
      <g>
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="6" fill="#5B8DEF"></rect>
        <text x="${x + barWidth / 2}" y="${height - 10}" text-anchor="middle" font-size="12" fill="#333">Week ${index + 1}</text>
      </g>
    `;
  }).join('');

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Weekly Expenses Chart">
      <rect width="100%" height="100%" fill="#F7F9FC" rx="12"></rect>
      ${bars}
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#D7DDE6" stroke-width="1" />
    </svg>
  `;
}

function renderExpenseItems(items?: ExpenseItem[] | null): string {
  if (!items || items.length === 0) return '—';
  return items
    .map(item => item.price != null ? `${item.name} (${formatCurrency(item.price)})` : item.name)
    .join(', ');
}

function renderSaleItems(items?: string[] | null): string {
  if (!items || items.length === 0) return '—';
  return items.join(', ');
}

function buildDailySection(days: DailySummary[], split: NetSalesSplit): string {
  return days.map(day => `
    <div class="day-block">
      <h3>${formatDateLabel(day.dateKey)}</h3>
      <div class="totals-grid">
        <div class="total-card">
          <span class="label">Total Sales</span>
          <span class="value">${formatCurrency(day.totalSales)}</span>
        </div>
        <div class="total-card">
          <span class="label">Total Expenses</span>
          <span class="value">${formatCurrency(day.totalExpenses)}</span>
        </div>
        <div class="total-card">
          <span class="label">Net Sales</span>
          <span class="value">${formatCurrency(day.netSales)}</span>
        </div>
      </div>

      <div class="split-box">
        <div class="split-title">Net Sales Split (OP ${split.operation}%, GM ${split.general}%, FC ${split.foodCart}% — ${split.includeExp ? 'after expenses' : 'before expenses'})</div>
        <div class="split-row">
          <span>Operation Manager</span>
          <span>${formatCurrency(day.splitAmounts.operation)}</span>
        </div>
        <div class="split-row">
          <span>General Manager</span>
          <span>${formatCurrency(day.splitAmounts.general)}</span>
        </div>
        <div class="split-row">
          <span>Food Cart</span>
          <span>${formatCurrency(day.splitAmounts.foodCart)}</span>
        </div>
      </div>

      <div class="table-block">
        <h4>Sales Details</h4>
        <table>
          <thead>
            <tr>
              <th>Sale</th>
              <th>Items</th>
              <th>Total</th>
              <th>Created At</th>
            </tr>
          </thead>
          <tbody>
            ${day.sales.length > 0 ? day.sales.map(sale => `
              <tr>
                <td>${sale.name || 'Sale'}</td>
                <td>${renderSaleItems(sale.items)}</td>
                <td>${formatCurrency(sale.total)}</td>
                <td>${formatDateTime(sale.createdAt)}</td>
              </tr>
            `).join('') : `
              <tr><td colspan="4" class="empty">No sales recorded.</td></tr>
            `}
          </tbody>
        </table>
      </div>

      <div class="table-block">
        <h4>Expense Details</h4>
        <table>
          <thead>
            <tr>
              <th>Expense</th>
              <th>Items</th>
              <th>Total</th>
              <th>Created At</th>
            </tr>
          </thead>
          <tbody>
            ${day.expenses.length > 0 ? day.expenses.map(expense => `
              <tr>
                <td>${expense.name || 'Expense'}</td>
                <td>${renderExpenseItems(expense.items)}</td>
                <td>${formatCurrency(expense.total)}</td>
                <td>${formatDateTime(expense.createdAt)}</td>
              </tr>
            `).join('') : `
              <tr><td colspan="4" class="empty">No expenses recorded.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  `).join('');
}

function buildWeeklySection(weeks: WeeklySummary[], split: NetSalesSplit): string {
  return weeks.map((week, index) => `
    <div class="week-block">
      <h3>Week ${index + 1} (${formatWeekLabel(week.range)})</h3>
      <div class="totals-grid">
        <div class="total-card">
          <span class="label">Total Sales</span>
          <span class="value">${formatCurrency(week.totalSales)}</span>
        </div>
        <div class="total-card">
          <span class="label">Total Expenses</span>
          <span class="value">${formatCurrency(week.totalExpenses)}</span>
        </div>
        <div class="total-card">
          <span class="label">Net Sales</span>
          <span class="value">${formatCurrency(week.netSales)}</span>
        </div>
      </div>

      <div class="split-box">
        <div class="split-title">Net Sales Split Totals (OP ${split.operation}%, GM ${split.general}%, FC ${split.foodCart}% — ${split.includeExp ? 'after expenses' : 'before expenses'})</div>
        <div class="split-row">
          <span>Operation Manager</span>
          <span>${formatCurrency(week.splitAmounts.operation)}</span>
        </div>
        <div class="split-row">
          <span>General Manager</span>
          <span>${formatCurrency(week.splitAmounts.general)}</span>
        </div>
        <div class="split-row">
          <span>Food Cart</span>
          <span>${formatCurrency(week.splitAmounts.foodCart)}</span>
        </div>
      </div>

      <div class="table-block">
        <h4>Daily Breakdown</h4>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Sales</th>
              <th>Expenses</th>
              <th>Net Sales</th>
            </tr>
          </thead>
          <tbody>
            ${week.days.map(day => `
              <tr>
                <td>${formatDateLabel(day.dateKey)}</td>
                <td>${formatCurrency(day.totalSales)}</td>
                <td>${formatCurrency(day.totalExpenses)}</td>
                <td>${formatCurrency(day.netSales)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('');
}

function buildMonthlySection(monthly: MonthlySummary): string {
  return `
    <div class="month-block">
      <h3>${monthly.monthLabel}</h3>
      <div class="totals-grid">
        <div class="total-card">
          <span class="label">Total Sales</span>
          <span class="value">${formatCurrency(monthly.totalSales)}</span>
        </div>
        <div class="total-card">
          <span class="label">Total Expenses</span>
          <span class="value">${formatCurrency(monthly.totalExpenses)}</span>
        </div>
        <div class="total-card">
          <span class="label">Net Sales</span>
          <span class="value">${formatCurrency(monthly.netSales)}</span>
        </div>
      </div>

      <div class="table-block">
        <h4>Top Sales</h4>
        <table>
          <thead>
            <tr>
              <th>Sale</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${monthly.topSales.length > 0 ? monthly.topSales.map(sale => `
              <tr>
                <td>${sale.name || 'Sale'}</td>
                <td>${formatCurrency(sale.total)}</td>
              </tr>
            `).join('') : `
              <tr><td colspan="2" class="empty">No sales for this month.</td></tr>
            `}
          </tbody>
        </table>
      </div>

      <div class="table-block">
        <h4>Top Expenses</h4>
        <table>
          <thead>
            <tr>
              <th>Expense</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${monthly.topExpenses.length > 0 ? monthly.topExpenses.map(expense => `
              <tr>
                <td>${expense.name || 'Expense'}</td>
                <td>${formatCurrency(expense.total)}</td>
              </tr>
            `).join('') : `
              <tr><td colspan="2" class="empty">No expenses for this month.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export async function buildPdfSummaryHtml({
  weeks,
  selectedWeekIndex,
  appName = 'MY Food Cart',
}: {
  weeks?: PdfWeekRange[];
  selectedWeekIndex?: number;
  appName?: string;
}): Promise<PdfSummaryResult> {
  const split = await loadNetSalesSplit();
  const resolvedWeeks = weeks ?? [0, 1, 2, 3].map(index => getWeekRange(index));

  const weeklySummaries: WeeklySummary[] = [];
  const allDailySummaries: DailySummary[] = [];

  for (const week of resolvedWeeks) {
    const startDateStr = toLocalDayKey(week.start);
    const endDateStr = toLocalDayKey(week.end);
    const [sales, expenses] = await Promise.all([
      getSalesByDateRange(startDateStr, endDateStr),
      getExpensesByDateRange(startDateStr, endDateStr),
    ]);

    const dayKeys = getDayKeysForWeek(week.start);
    const dailySummaries = buildDailySummaries(dayKeys, sales, expenses, split);
    const totalSales = dailySummaries.reduce((sum, day) => sum + day.totalSales, 0);
    const totalExpenses = dailySummaries.reduce((sum, day) => sum + day.totalExpenses, 0);
    const netSales = totalSales - totalExpenses;
    const splitAmounts = calculateSplitAmounts(totalSales, totalExpenses, split);

    weeklySummaries.push({
      range: week,
      days: dailySummaries,
      totalSales,
      totalExpenses,
      netSales,
      splitAmounts,
    });
    allDailySummaries.push(...dailySummaries);
  }

  const selectedWeek = resolvedWeeks[selectedWeekIndex ?? 0] ?? resolvedWeeks[0];
  const monthRange = getMonthRange(selectedWeek.start);
  const monthStartStr = toLocalDayKey(monthRange.start);
  const monthEndStr = toLocalDayKey(monthRange.end);
  const [monthlySales, monthlyExpenses] = await Promise.all([
    getSalesByDateRange(monthStartStr, monthEndStr),
    getExpensesByDateRange(monthStartStr, monthEndStr),
  ]);

  const monthlyTotals = {
    totalSales: monthlySales.reduce((sum, sale) => sum + sale.total, 0),
    totalExpenses: monthlyExpenses.reduce((sum, expense) => sum + expense.total, 0),
  };
  const monthlyNet = monthlyTotals.totalSales - monthlyTotals.totalExpenses;

  const monthlySummary: MonthlySummary | null = (monthlySales.length > 0 || monthlyExpenses.length > 0)
    ? {
      monthLabel: monthRange.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      totalSales: monthlyTotals.totalSales,
      totalExpenses: monthlyTotals.totalExpenses,
      netSales: monthlyNet,
      topSales: [...monthlySales].sort((a, b) => b.total - a.total).slice(0, 5),
      topExpenses: [...monthlyExpenses].sort((a, b) => b.total - a.total).slice(0, 5),
    }
    : null;

  const weeklyChart = buildWeeklyExpensesChart(weeklySummaries);
  const weeklyTableRows = weeklySummaries.map((week, index) => `
    <tr>
      <td>Week ${index + 1} (${formatWeekLabel(week.range)})</td>
      <td>${formatCurrency(week.totalExpenses)}</td>
    </tr>
  `).join('');

  const generatedAt = new Date();
  const reportDate = generatedAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: 'Helvetica', 'Arial', sans-serif;
            color: #1F2937;
            background: #FFFFFF;
            margin: 0;
            padding: 32px;
          }
          h1, h2, h3, h4 { margin: 0 0 12px; }
          h2 { margin-top: 24px; font-size: 22px; border-bottom: 2px solid #EEF1F5; padding-bottom: 8px; }
          h3 { margin-top: 18px; font-size: 18px; }
          h4 { font-size: 15px; margin-bottom: 8px; }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
          }
          .header .title { font-size: 28px; font-weight: 700; }
          .header .date { font-size: 14px; color: #6B7280; }
          .section { margin-bottom: 32px; }
          .totals-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
          }
          .total-card {
            background: #F7F9FC;
            border: 1px solid #E5E9F2;
            border-radius: 10px;
            padding: 12px;
          }
          .total-card .label { display: block; font-size: 12px; color: #6B7280; margin-bottom: 6px; }
          .total-card .value { font-size: 16px; font-weight: 600; }
          .split-box {
            border: 1px solid #E5E9F2;
            border-radius: 10px;
            padding: 12px;
            background: #FFFFFF;
            margin-bottom: 16px;
          }
          .split-title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 8px;
            color: #374151;
          }
          .split-row {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            padding: 4px 0;
            border-bottom: 1px dashed #E5E9F2;
          }
          .split-row:last-child { border-bottom: none; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
          }
          th, td {
            text-align: left;
            padding: 8px;
            border-bottom: 1px solid #E5E9F2;
            font-size: 12px;
          }
          th { background: #F3F6FB; font-weight: 600; color: #374151; }
          .empty { text-align: center; color: #9CA3AF; font-style: italic; }
          .day-block, .week-block, .month-block {
            border: 1px solid #E5E9F2;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 20px;
            background: #FAFBFE;
          }
          .chart-block { margin-top: 16px; }
          .chart-table td { font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">${appName} — PDF Summary</div>
          <div class="date">Generated ${reportDate}</div>
        </div>

        <div class="section">
          <h2>Daily Summary</h2>
          ${buildDailySection(allDailySummaries, split)}
        </div>

        <div class="section">
          <h2>Weekly Summary</h2>
          ${buildWeeklySection(weeklySummaries, split)}
        </div>

        <div class="section">
          <h2>Weekly Expenses (4 Weeks)</h2>
          <div class="chart-block">${weeklyChart}</div>
          <table class="chart-table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Total Expenses</th>
              </tr>
            </thead>
            <tbody>
              ${weeklyTableRows}
            </tbody>
          </table>
        </div>

        ${monthlySummary ? `
          <div class="section">
            <h2>Monthly Summary</h2>
            ${buildMonthlySection(monthlySummary)}
          </div>
        ` : ''}
      </body>
    </html>
  `;

  const fileName = `MY-Food-Cart-Summary-${toLocalDayKey(generatedAt)}.pdf`;
  return { html, fileName };
}
