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
import { getMonthlySummary, getAccounts, getCategoryBreakdown, CategoryBreakdownItem } from '../../services/transactionService';
import { Account } from '../../models';
import CategoryDonut from '../../widgets/CategoryDonut';

export default function DashboardScreen() {
  const [summary, setSummary] = useState({ income: 0, expenses: 0, netCashflow: 0 });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expenseBreakdown, setExpenseBreakdown] = useState<CategoryBreakdownItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const now = new Date();
      const [monthlySummary, accountsData, breakdown] = await Promise.all([
        getMonthlySummary(now.getFullYear(), now.getMonth() + 1),
        getAccounts(),
        getCategoryBreakdown(now.getFullYear(), now.getMonth() + 1, 'expense'),
      ]);
      setSummary(monthlySummary);
      setAccounts(accountsData);
      setExpenseBreakdown(breakdown);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
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

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Family Cash Flow</Text>
        <Text style={styles.date}>
          {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Net Cashflow</Text>
        <Text
          style={[
            styles.summaryAmount,
            { color: summary.netCashflow >= 0 ? Colors.income : Colors.expense },
          ]}
        >
          {summary.netCashflow >= 0 ? '+' : ''}{summary.netCashflow.toLocaleString()}
        </Text>
      </View>

      <View style={styles.row}>
        <View style={[styles.summaryBox, { backgroundColor: '#ECFDF5' }]}>
          <Text style={styles.boxLabel}>Income</Text>
          <Text style={[styles.boxAmount, { color: Colors.income }]}>
            +{summary.income.toLocaleString()}
          </Text>
        </View>
        <View style={[styles.summaryBox, { backgroundColor: '#FEF2F2' }]}>
          <Text style={styles.boxLabel}>Expenses</Text>
          <Text style={[styles.boxAmount, { color: Colors.expense }]}>
            -{summary.expenses.toLocaleString()}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Accounts</Text>
        {accounts.length === 0 ? (
          <Text style={styles.emptyText}>No accounts yet. Add one to get started.</Text>
        ) : (
          accounts.map((account) => (
            <View key={account.id} style={styles.accountCard}>
              <View>
                <Text style={styles.accountName}>{account.name}</Text>
                <Text style={styles.accountType}>{account.type.replace('_', ' ')}</Text>
              </View>
              <Text style={styles.accountBalance}>
                {account.balance.toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spending by Category</Text>
        <View style={styles.donutCard}>
          <CategoryDonut data={expenseBreakdown} total={summary.expenses} label="Spent" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Total Balance</Text>
        <Text style={styles.totalBalance}>{totalBalance.toLocaleString()}</Text>
      </View>
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
  accountCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  accountName: {
    fontSize: FontSize.md,
    fontWeight: '500',
    color: Colors.text,
  },
  accountType: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  accountBalance: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  totalBalance: {
    fontSize: FontSize.xxl,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
  },
  emptyText: {
    color: Colors.textMuted,
    textAlign: 'center',
    padding: Spacing.lg,
  },
  donutCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
});
