import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  LayoutAnimation,
  Platform,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { formatMoney } from '../../core/format';
import { getTransactions } from '../../services/transactionService';
import { Transaction } from '../../models';
import { TRANSACTION_TYPE_LABELS } from '../../constants/categories';

type DaySection = {
  date: string;
  items: Transaction[];
  total: number;
};

export function monthOptions(count = 6): { key: string; label: string }[] {
  const now = new Date();
  const opts: { key: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    });
  }
  return opts;
}

function lastDayOfMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${new Date(y, m, 0).getDate()}`;
}

export default function TransactionsScreen({ navigation }: { navigation: any }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expandedDates, setExpandedDates] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const data = await getTransactions({
        limit: 50,
        ...(monthFilter
          ? { startDate: `${monthFilter}-01`, endDate: lastDayOfMonth(monthFilter) }
          : {}),
      });
      setTransactions(data);
      const dates = Array.from(new Set(data.map((t) => t.txn_date)));
      setExpandedDates(dates.length ? [dates.sort().reverse()[0]] : []);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    }
  };

  useEffect(() => {
    loadData();
  }, [monthFilter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const toggleDay = (date: string) => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpandedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]
    );
  };

  const groupedByDate = transactions.reduce((groups, txn) => {
    const date = String(txn.txn_date || '').slice(0, 10);
    if (!groups[date]) groups[date] = [];
    groups[date].push(txn);
    return groups;
  }, {} as Record<string, Transaction[]>);

  const sections: DaySection[] = Object.entries(groupedByDate)
    .map(([date, items]) => ({
      date,
      items,
      total: items.reduce((sum, t) => {
        const amount = Number(t.amount) || 0;
        if (t.type === 'income') return sum + amount;
        if (t.type === 'expense') return sum - amount;
        return sum;
      }, 0),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const getTypeColor = (type: Transaction['type']) => {
    switch (type) {
      case 'income': return Colors.income;
      case 'expense': return Colors.expense;
      case 'transfer':
      case 'transfer_in':
      case 'transfer_out': return Colors.transfer;
      case 'saving': return Colors.saving;
      case 'investment': return Colors.investment;
      default: return Colors.text;
    }
  };

  const dayInfo = (date: string) => {
    const norm = String(date || '').slice(0, 10);
    const [y, m, d] = norm.split('-').map(Number);
    if (norm.length !== 10 || ![y, m, d].every(Number.isFinite)) {
      return { day: '--', month: '', weekday: 'Unknown date', full: 'Unknown date' };
    }
    const dt = new Date(y, m - 1, d);
    const weekday = dt.toLocaleDateString('en-US', { weekday: 'long' });
    const month = dt.toLocaleDateString('en-US', { month: 'short' });
    const full = dt.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    return { day: d, month: month.toUpperCase(), weekday, full };
  };

  const renderSection = ({ item }: { item: DaySection }) => {
    const isExpanded = expandedDates.includes(item.date);
    const info = dayInfo(item.date);
    const totalColor = item.total >= 0 ? Colors.income : Colors.expense;

    return (
      <View style={[styles.dayCard, isExpanded && styles.dayCardOpen]}>
        <TouchableOpacity
          style={styles.dayHeader}
          onPress={() => toggleDay(item.date)}
          activeOpacity={0.7}
        >
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeMonth}>{info.month}</Text>
            <Text style={styles.dateBadgeDay}>{info.day}</Text>
          </View>
          <View style={styles.dayHeaderInfo}>
            <Text style={styles.dayWeekday}>{info.weekday}</Text>
            <Text style={styles.dayMeta}>
              {item.items.length} transaction{item.items.length === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.dayHeaderRight}>
            <Text style={[styles.dayTotal, { color: totalColor }]}>
              {item.total >= 0 ? '+' : ''}{formatMoney(item.total)}
            </Text>
            <Text style={[styles.chevron, { color: Colors.textMuted }]}>
              {isExpanded ? '\u2304' : '\u203A'}
            </Text>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.dayBody}>
            {item.items.map((txn, index) => {
              const typeColor = getTypeColor(txn.type);
              const label = TRANSACTION_TYPE_LABELS[txn.type];
              return (
                <TouchableOpacity
                  key={txn.id}
                  style={[
                    styles.txnRow,
                    index < item.items.length - 1 && styles.txnRowBorder,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('AddTransaction', { transactionId: txn.id })}
                >
                  <View style={[styles.typeBadge, { backgroundColor: `${typeColor}1A` }]}>
                    <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                      {label.charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.txnInfo}>
                    <Text style={styles.txnTitle} numberOfLines={1}>
                      {txn.note || txn.merchant_name || label}
                    </Text>
                    <Text style={styles.txnSub}>{label}</Text>
                  </View>
                  <Text style={[styles.txnAmount, { color: typeColor }]}>
                    {txn.type === 'income'
                      ? `+${formatMoney(txn.amount)}`
                      : txn.type === 'expense'
                        ? `-${formatMoney(txn.amount)}`
                        : formatMoney(txn.amount)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const visibleTotal = sections.reduce((sum, s) => sum + s.total, 0);

  const filteredLabel = monthFilter
    ? monthOptions().find((o) => o.key === monthFilter)?.label
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Transactions</Text>
        <Text style={styles.headerSub}>
          {filteredLabel ? `${transactions.length} in ${filteredLabel}` : `${transactions.length} shown`} · {formatMoney(visibleTotal)} balance
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterBar}
          contentContainerStyle={styles.filterContent}
        >
          <TouchableOpacity
            style={[styles.filterChip, monthFilter === null && styles.filterChipActive]}
            onPress={() => setMonthFilter(null)}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.filterChipText, monthFilter === null && styles.filterChipTextActive]}
            >
              All
            </Text>
          </TouchableOpacity>
          {monthOptions().map((opt) => {
            const active = monthFilter === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setMonthFilter(active ? null : opt.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={sections}
        renderItem={renderSection}
        keyExtractor={(item) => item.date}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListFooterComponent={
          sections.length > 0 ? (
            <View style={styles.footerHint}>
              <Text style={styles.footerHintText}>Tap a day header to collapse or expand it</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyIcon}>{'\uD83D\uDCCB'}</Text>
            </View>
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptySubtext}>Tap + below to add your first transaction</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.xl,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: FontSize.xxl, fontWeight: 'bold', color: Colors.text },
  headerSub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  filterBar: { marginTop: Spacing.md, flexGrow: 0 },
  filterContent: { gap: Spacing.sm, paddingRight: Spacing.lg },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  filterChipTextActive: { color: '#FFFFFF' },
  list: { padding: Spacing.md, paddingBottom: Spacing.xl },

  dayCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  dayCardOpen: { borderColor: '#D6E4FF' },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  dateBadge: {
    width: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    marginRight: Spacing.md,
  },
  dateBadgeMonth: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  dateBadgeDay: { fontSize: FontSize.xl, fontWeight: 'bold', color: Colors.text },
  dayHeaderInfo: { flex: 1 },
  dayWeekday: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  dayMeta: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  dayHeaderRight: { alignItems: 'flex-end', marginLeft: Spacing.sm },
  dayTotal: { fontSize: FontSize.md, fontWeight: '700' },
  chevron: { fontSize: FontSize.lg, marginTop: 2 },

  dayBody: { borderTopWidth: 1, borderTopColor: Colors.border },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    paddingVertical: Spacing.sm + Spacing.xs,
  },
  txnRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  typeBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  typeBadgeText: { fontSize: FontSize.md, fontWeight: '700' },
  txnInfo: { flex: 1, marginRight: Spacing.sm },
  txnTitle: { fontSize: FontSize.md, fontWeight: '500', color: Colors.text },
  txnSub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  txnAmount: { fontSize: FontSize.md, fontWeight: '700' },

  footerHint: { alignItems: 'center', marginTop: Spacing.xs },
  footerHintText: { fontSize: FontSize.xs, color: Colors.textMuted },

  empty: { alignItems: 'center', padding: Spacing.xl * 1.5, marginTop: Spacing.xl },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyIcon: { fontSize: 32 },
  emptyText: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: Spacing.xs, textAlign: 'center' },
});