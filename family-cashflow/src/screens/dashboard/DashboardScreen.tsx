import React, { useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
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
import { getCategoryBreakdownRange, getCategories, getSeries, SeriesBucket } from '../../services/transactionService';
import { Category } from '../../models';
import { getBudgets, BudgetProgress } from '../../services/budgetService';
import IncomeAllocationChart from '../../widgets/IncomeAllocationChart';
import ExpenseLineChart from '../../widgets/ExpenseLineChart';
import { useI18n } from '../../core/i18n';

type PeriodKey = 'daily' | 'weekly' | 'monthly';

const PERIODS: PeriodKey[] = ['daily', 'weekly', 'monthly'];

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

export default function DashboardScreen() {
  const { t, locale } = useI18n();
  const isFocused = useIsFocused();
  const [period, setPeriod] = useState<PeriodKey>('monthly');
  const [summary, setSummary] = useState({ income: 0, expenses: 0, netCashflow: 0, saved: 0, invested: 0 });
  const [expenseBreakdown, setExpenseBreakdown] = useState<Awaited<ReturnType<typeof getCategoryBreakdownRange>>>([]);
  const [series, setSeries] = useState<Awaited<ReturnType<typeof getSeries>>>([]);
  const [graphCats, setGraphCats] = useState<Category[]>([]);
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<BudgetProgress[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const periodTitle = (p: PeriodKey): string => {
    const now = new Date();
    if (p === 'daily') {
      return now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
    }
    if (p === 'weekly') {
      return t('dash.week_of', {
        date: mondayOf(now).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      });
    }
    return now.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  };

  const loadData = async () => {
    try {
      const window = periodWindow(period);
      const base = getSeries(window.bucket, window.startDate, window.endDate);
      const catTrend = catFilter
        ? getSeries(window.bucket, window.startDate, window.endDate, catFilter)
        : base;
      const [rawSeries, trend, breakdown, budgetData] = await Promise.all([
        base,
        catTrend,
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
      setSeries(trend);
      setExpenseBreakdown(breakdown);
      setBudgets(budgetData.budgets);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  useEffect(() => {
    if (isFocused) loadData();
  }, [period, catFilter, isFocused]);

  useEffect(() => {
    getCategories('expense')
      .then(setGraphCats)
      .catch((e) => console.error('Failed to load expense categories:', e));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const overCount = budgets.filter((b) => b.over_budget).length;
  const warningCount = budgets.filter((b) => !b.over_budget && b.progress >= 0.8).length;

  const window = periodWindow(period);
  const byLabel = new Map(series.map((p) => [p.label, p.expense]));
  const trendData = window.keys.map((k) => ({ x: k, value: byLabel.get(k) || 0 }));

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
        {PERIODS.map((key) => (
          <TouchableOpacity
            key={key}
            style={[styles.periodButton, period === key && styles.periodButtonActive]}
            onPress={() => setPeriod(key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodLabel, period === key && styles.periodLabelActive]}>
              {t(`dash.${key}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>{t('dash.net_cashflow')}</Text>
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
          <Text style={styles.boxLabel}>{t('dash.income')}</Text>
          <Text style={[styles.boxAmount, { color: Colors.income }]}>
            +{formatMoney(summary.income)}
          </Text>
        </View>
        <View style={[styles.summaryBox, { backgroundColor: '#FEF2F2' }]}>
          <Text style={styles.boxLabel}>{t('dash.expenses')}</Text>
          <Text style={[styles.boxAmount, { color: Colors.expense }]}>
            -{formatMoney(summary.expenses)}
          </Text>
        </View>
      </View>

      <View style={[styles.rollupRow, { marginTop: Spacing.md }]}>
        <View style={[styles.summaryBox, { backgroundColor: '#F3E8FF' }]}>
          <Text style={styles.boxLabel}>{t('dash.saved')}</Text>
          <Text style={[styles.boxAmount, { color: Colors.saving }]}>
            {formatMoney(summary.saved)}
          </Text>
        </View>
        <View style={[styles.summaryBox, { backgroundColor: '#FFF7ED' }]}>
          <Text style={styles.boxLabel}>{t('dash.invested')}</Text>
          <Text style={[styles.boxAmount, { color: Colors.investment }]}>
            {formatMoney(summary.invested)}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('dash.expense_trend')}</Text>
        <View style={styles.chartCard}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.trendFilter}
            contentContainerStyle={styles.trendFilterContent}
          >
            <TouchableOpacity
              style={[styles.trendChip, catFilter === null && styles.trendChipActive]}
              onPress={() => setCatFilter(null)}
              activeOpacity={0.7}
            >
              <Text style={[styles.trendChipText, catFilter === null && styles.trendChipTextActive]}>
                {t('graph.all_categories')}
              </Text>
            </TouchableOpacity>
            {graphCats.map((cat) => {
              const active = catFilter === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.trendChip,
                    styles.trendChipRow,
                    active && styles.trendChipActive,
                  ]}
                  onPress={() => setCatFilter(active ? null : cat.id)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.catDot,
                      { backgroundColor: active ? '#FFFFFF' : cat.color || Colors.expense },
                    ]}
                  />
                  <Text style={[styles.trendChipText, active && styles.trendChipTextActive]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <ExpenseLineChart
            data={trendData}
            color={
              catFilter
                ? graphCats.find((c) => c.id === catFilter)?.color || Colors.expense
                : Colors.expense
            }
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('dash.income_allocation')}</Text>
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
            <Text style={styles.budgetStripTitle}>{t('dash.budgets')}</Text>
            <Text style={styles.budgetStripSub}>
              {overCount > 0
                ? t('dash.over_budget', { n: overCount })
                : warningCount > 0
                  ? t('dash.near_limit', { n: warningCount })
                  : t('dash.all_on_track')}
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
  trendFilter: { marginBottom: Spacing.md, flexGrow: 0 },
  trendFilterContent: { gap: Spacing.sm, paddingRight: Spacing.lg },
  trendChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  trendChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  trendChipText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  trendChipTextActive: { color: '#FFFFFF' },
  trendChipRow: { flexDirection: 'row', alignItems: 'center' },
  catDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
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