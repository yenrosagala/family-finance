import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { formatMoney } from '../../core/format';
import { getTransactions } from '../../services/transactionService';
import { Transaction } from '../../models';
import { TRANSACTION_TYPE_LABELS } from '../../constants/categories';

export default function TransactionsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const data = await getTransactions({ limit: 50 });
      setTransactions(data);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const groupedByDate = transactions.reduce((groups, txn) => {
    const date = txn.txn_date;
    if (!groups[date]) groups[date] = [];
    groups[date].push(txn);
    return groups;
  }, {} as Record<string, Transaction[]>);

  const sections = Object.entries(groupedByDate).map(([date, items]) => ({
    date,
    items,
    total: items.reduce((sum, t) => {
      if (t.type === 'income') return sum + t.amount;
      if (t.type === 'expense') return sum - t.amount;
      return sum;
    }, 0),
  }));

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

  const renderSection = ({ item }: { item: typeof sections[0] }) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionDate}>
          {new Date(item.date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </Text>
        <Text
          style={[
            styles.sectionTotal,
            { color: item.total >= 0 ? Colors.income : Colors.expense },
          ]}
        >
          {item.total >= 0 ? '+' : ''}{formatMoney(item.total)}
        </Text>
      </View>
      {item.items.map((txn) => (
        <TouchableOpacity key={txn.id} style={styles.transactionCard}>
          <View style={styles.transactionLeft}>
            <View
              style={[styles.typeBadge, { backgroundColor: getTypeColor(txn.type) + '20' }]}
            >
              <Text style={[styles.typeText, { color: getTypeColor(txn.type) }]}>
                {TRANSACTION_TYPE_LABELS[txn.type].charAt(0)}
              </Text>
            </View>
            <View>
              <Text style={styles.transactionNote}>
                {txn.note || txn.merchant_name || TRANSACTION_TYPE_LABELS[txn.type]}
              </Text>
              <Text style={styles.transactionType}>
                {TRANSACTION_TYPE_LABELS[txn.type]}
              </Text>
            </View>
          </View>
          <Text
            style={[
              styles.transactionAmount,
              { color: txn.type === 'income' ? Colors.income : Colors.expense },
            ]}
          >
            {txn.type === 'income' ? '+' : '-'}{formatMoney(txn.amount)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Transactions</Text>
      </View>
      <FlatList
        data={sections}
        renderItem={renderSection}
        keyExtractor={(item) => item.date}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first transaction</Text>
          </View>
        }
      />
    </View>
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
    backgroundColor: Colors.surface,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: 'bold',
    color: Colors.text,
  },
  list: {
    padding: Spacing.md,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  sectionDate: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  sectionTotal: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  transactionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  typeBadge: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeText: {
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  transactionNote: {
    fontSize: FontSize.md,
    fontWeight: '500',
    color: Colors.text,
  },
  transactionType: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  transactionAmount: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyText: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
});
