import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { formatMoney } from '../../core/format';
import { getCategoryBreakdownRange, getSeries, SeriesBucket } from '../../services/transactionService';
import { getBudgets, BudgetProgress } from '../../services/budgetService';
import IncomeAllocationChart from '../../widgets/IncomeAllocationChart';

type PeriodKey = 'daily' | 'weekly' | 'monthly';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function todayKey(): string {
  return dateKey(new Date());
}

function lastNDayKeys(n: number): string[] {
  const base = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() - (n - 1 - i));
    return dateKey(d);
  });
}

function mondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diff);
  return monday;
}

function lastWeeksKeys(n: number): string[] {
  const monday = mondayOf(new Date());
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() - (n - 1 - i) * 7);
    return dateKey(d);
  });
}

function lastMonthsKeys(n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return monthKeyOf(d);
  });
}

function periodWindow(period: PeriodKey): { bucket: SeriesBucket; keys: string[]; startDate: string; endDate: string } {
  if (period === 'daily') {
    const keys = lastNDayKeys(7);
    return { bucket: 'day', keys, startDate: keys[0], endDate: keys[keys.length - 1] };
  }
  if (period === 'weekly') {
    const keys = lastWeeksKeys(4);
    return { bucket: 'week', keys, startDate: keys[0], endDate: todayKey() };
  }
  const keys = lastMonthsKeys(6);
  return { bucket: 'month', keys, startDate: `${keys[0]}-01`, endDate: todayKey() };
}

function periodTitle(period: PeriodKey): string {
  const now = new Date();
  if (period === 'daily') {
    return now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  if (period === 'weekly') {
    return `Week of ${mondayOf(now).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
  }
  return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function DashboardScreen() {
  const [period, setPeriod] = useState<PeriodKey>('monthly');
  const [summary, setSummary] = useState({ income: 0, expenses: 0, netCashflow: 0, saved: 0, invested: 0 });
  const [expenseBreakdown, setExpenseBreakdown] = useState<Awaited<ReturnType<typeof getCategoryBreakdownRange>>>([]);
  const [budgets, setBudgets] = useState<BudgetProgress[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const window = periodWindow(period);
      const [rawSeries, breakdown, budgetData] = await Promise.all([
        getSeries(window.bucket, window.startDate, window.endDate),
        getCategoryBreakdownRange(window.startDate, window.endDate, 'expense'),
        getBudgets(),
      ]);

      const totals = rawSeries.reduce(
        (acc, p) => ({
          income: acc.income + p.income,
          expenses: acc.expenses + p.expense,
          saved: acc.saved + p.saved,
          invested: acc.invested + p.invested,
        }),
        { income: 0, expenses: 0, saved: 0, invested: 0 }
      );

      setSummary({
        income: totals.income,
        expenses: totals.expenses,
        netCashflow: totals.income - totals.expenses,
        saved: totals.saved,
        invested: totals.invested,
      });
      setExpenseBreakdown(breakdown);
      setBudgets(budgetData.budgets);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  useEffect(() => {
    loadData();
  }, [period]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const overCount = budgets.filter((b) => b.over_budget).length;
  const warningCount = budgets.filter((b) => !b.over_budget && b.progress >= 0.8).length;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>FamFin</Text>
        <Text style={styles.date}>{periodTitle(period)}</Text>
      </View>

      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodButton, period === p.key && styles.periodButtonActive]}
            onPress={() => setPeriod(p.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodLabel, period === p.key && styles.periodLabelActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Net Cashflow</Text>
        <Text
          style={[
            styles.summaryAmount,
            { color: summary.netCashflow >= 0 ? Colors.income : Colors.expense },
          ]}
        >
          {summary.netCashflow >= 0 ? '+' : ''}{formatMoney(summary.netCashflow)}
        </Text>
      </View>

      <View style={styles.row}>
        <View style={[styles.summaryBox, { backgroundColor: '#ECFDF5' }]}>
          <Text style={styles.boxLabel}>Income</Text>
          <Text style={[styles.boxAmount, { color: Colors.income }]}>
            +{formatMoney(summary.income)}
          </Text>
        </View>
        <View style={[styles.summaryBox, { backgroundColor: '#FEF2F2' }]}>
          <Text style={styles.boxLabel}>Expenses</Text>
          <Text style={[styles.boxAmount, { color: Colors.expense }]}>
            -{formatMoney(summary.expenses)}
          </Text>
        </View>
      </View>

      <View style={[styles.rollupRow, { marginTop: Spacing.md }]}>
        <View style={[styles.summaryBox, { backgroundColor: '#F3E8FF' }]}>
          <Text style={styles.boxLabel}>Saved</Text>
          <Text style={[styles.boxAmount, { color: Colors.saving }]}>
            {formatMoney(summary.saved)}
          </Text>
        </View>
        <View style={[styles.summaryBox, { backgroundColor: '#FFF7ED' }]}>
          <Text style={styles.boxLabel}>Invested</Text>
          <Text style={[styles.boxAmount, { color: Colors.investment }]}>
            {formatMoney(summary.invested)}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Income Allocation</Text>
        <View style={styles.chartCard}>
          <IncomeAllocationChart
            income={summary.income}
            expenses={summary.expenses}
            saved={summary.saved}
            invested={summary.invested}
            expenseBreakdown={expenseBreakdown}
            period={period}
          />
        </View>
      </View>

      {budgets.length > 0 && (
        <View style={styles.section}>
          <View style={styles.budgetStrip}>
            <Text style={styles.budgetStripTitle}>Budgets</Text>
            <Text style={styles.budgetStripSub}>
              {overCount > 0
                ? `${overCount} over budget · see Budgets`
                : warningCount > 0
                  ? `${warningCount} near limit · see Budgets`
                  : "All on track"}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    padding: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  greeting: {
    fontSize: FontSize.xxl,
    fontWeight: 'bold',
    color: Colors.text,
  },
  date: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  periodRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: 4,
    gap: 4,
  },
  periodButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md - 2,
  },
  periodButtonActive: {
    backgroundColor: Colors.primary,
  },
  periodLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  periodLabelActive: {
    color: Colors.surface,
  },
  summaryCard: {
    backgroundColor: Colors.primary,
    margin: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  summaryLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: FontSize.sm,
  },
  summaryAmount: {
    fontSize: FontSize.title,
    fontWeight: 'bold',
    marginTop: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  rollupRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  summaryBox: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  boxLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  boxAmount: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    marginTop: Spacing.xs,
  },
  section: {
    margin: Spacing.md,
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  chartCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  budgetStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  budgetStripTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  budgetStripSub: { fontSize: FontSize.sm, color: Colors.textSecondary },
});