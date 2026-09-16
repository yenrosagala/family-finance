import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { formatMoney } from '../../core/format';
import { createTransaction, updateTransaction, getTransactions, getAccounts, getCategories } from '../../services/transactionService';
import { getBudgets, BudgetProgress } from '../../services/budgetService';
import { getSavingGoals, SavingGoalProgress } from '../../services/savingGoalService';
import { getInvestments, InvestmentProgress } from '../../services/investmentService';
import { Account, Category } from '../../models';
import { TRANSACTION_TYPES, TRANSACTION_TYPE_LABELS, TransactionType } from '../../constants/categories';

type AddTransactionScreenProps = {
  navigation: any;
  route?: any;
};

export default function AddTransactionScreen({ navigation, route }: AddTransactionScreenProps) {
  const editingId = route?.params?.transactionId as string | undefined;
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [fromAccountId, setFromAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [savingGoals, setSavingGoals] = useState<SavingGoalProgress[]>([]);
  const [investments, setInvestments] = useState<InvestmentProgress[]>([]);
  const [budgets, setBudgets] = useState<BudgetProgress[]>([]);
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);
  const [investmentId, setInvestmentId] = useState<string | null>(null);
  const [toPerson, setToPerson] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(Boolean(editingId));

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (editingId) {
      loadTransaction(editingId);
    }
  }, [editingId]);

  const loadTransaction = async (id: string) => {
    try {
      const all = await getTransactions();
      const tx = all.find((t) => t.id === id);
      if (!tx) {
        Alert.alert('Error', 'Transaction not found');
        navigation.goBack();
        return;
      }
      setType(tx.type);
      setAmount(String(tx.amount));
      setNote(tx.note || '');
      setDate(String(tx.txn_date || '').slice(0, 10) || new Date().toISOString().split('T')[0]);
      setFromAccountId(tx.from_account_id);
      setToAccountId(tx.to_account_id);
      setCategoryId(tx.category_id);
      setSavingGoalId(tx.saving_goal_id);
      setInvestmentId(tx.investment_id);
      setToPerson(tx.to_person || '');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, [type]);

  const loadData = async () => {
    try {
      const [accountsData, savingGoalsData, investmentsData, budgetData] = await Promise.all([
        getAccounts(),
        getSavingGoals(),
        getInvestments(),
        getBudgets(),
      ]);
      setAccounts(accountsData);
      setSavingGoals(savingGoalsData);
      setInvestments(investmentsData);
      setBudgets(budgetData.budgets);
      if (accountsData.length > 0) {
        setFromAccountId(accountsData[0].id);
        setToAccountId(accountsData[0].id);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const loadCategories = async () => {
    try {
      const typeForCategory = (type === 'income' || type === 'expense') ? type : undefined;
      const categoriesData = await getCategories(typeForCategory);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const handleSave = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (type === 'saving' && !savingGoalId) {
      Alert.alert('Error', 'Choose a saving goal');
      return;
    }
    if (type === 'investment' && !investmentId) {
      Alert.alert('Error', 'Choose an investment');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        type,
        amount: parseFloat(amount),
        txn_date: date,
        note: note || null,
        category_id: categoryId,
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        to_person: (type === 'transfer_out' || type === 'transfer_in') ? (toPerson || null) : null,
        investment_id: type === 'investment' ? investmentId : null,
        saving_goal_id: type === 'saving' ? savingGoalId : null,
        merchant_name: null,
        receipt_image_url: null,
        categorization_source: 'manual' as const,
        receipt_fingerprint: null,
      };

      if (editingId) {
        await updateTransaction(editingId, payload);
      } else {
        await createTransaction(payload);
      }

      Alert.alert('Success', editingId ? 'Transaction updated!' : 'Transaction added!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const showFromAccount = ['expense', 'transfer', 'transfer_out', 'investment', 'saving'].includes(type);
  const showToAccount = ['income', 'transfer', 'transfer_in', 'saving'].includes(type);
  const showCategory = ['income', 'expense'].includes(type);
  const showSavingGoal = type === 'saving';
  const showInvestment = type === 'investment';
  const showToPerson = type === 'transfer_out' || type === 'transfer_in';

  const activeBudget = type === 'expense' && categoryId
    ? budgets.find((b) => b.category_id === categoryId)
    : null;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{editingId ? 'Edit Transaction' : 'Add Transaction'}</Text>
      </View>

      <View style={styles.typeSelector}>
        {TRANSACTION_TYPES.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.typeButton, type === t && styles.typeButtonActive]}
            onPress={() => setType(t)}
          >
            <Text style={[styles.typeButtonText, type === t && styles.typeButtonTextActive]}>
              {TRANSACTION_TYPE_LABELS[t]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.amountInput}
          placeholder="0"
          placeholderTextColor={Colors.textMuted}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
        />

        <TextInput
          style={styles.input}
          placeholder="Note (optional)"
          placeholderTextColor={Colors.textMuted}
          value={note}
          onChangeText={setNote}
        />

        <TextInput
          style={styles.input}
          placeholder="Date (YYYY-MM-DD)"
          placeholderTextColor={Colors.textMuted}
          value={date}
          onChangeText={setDate}
        />

        {showFromAccount && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>From Account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {accounts.map((account) => (
                <TouchableOpacity
                  key={account.id}
                  style={[styles.chip, fromAccountId === account.id && styles.chipActive]}
                  onPress={() => setFromAccountId(account.id)}
                >
                  <Text style={[styles.chipText, fromAccountId === account.id && styles.chipTextActive]}>
                    {account.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {showToAccount && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>To Account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {accounts.map((account) => (
                <TouchableOpacity
                  key={account.id}
                  style={[styles.chip, toAccountId === account.id && styles.chipActive]}
                  onPress={() => setToAccountId(account.id)}
                >
                  <Text style={[styles.chipText, toAccountId === account.id && styles.chipTextActive]}>
                    {account.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {showCategory && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {categories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.chip, categoryId === category.id && styles.chipActive]}
                  onPress={() => setCategoryId(category.id)}
                >
                  <Text style={[styles.chipText, categoryId === category.id && styles.chipTextActive]}>
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {activeBudget && (
          <View
            style={[
              styles.budgetHint,
              activeBudget.over_budget && { backgroundColor: '#FEF2F2', borderColor: Colors.expense },
            ]}
          >
            <Text style={[styles.budgetHintText, { color: activeBudget.over_budget ? Colors.expense : Colors.textSecondary }]}>
              {activeBudget.over_budget
                ? `Already over your ${activeBudget.category_name} budget by ${formatMoney(
                    activeBudget.spent - activeBudget.monthly_limit
                  )} this month`
                : `Budget: ${formatMoney(activeBudget.spent)} of ${formatMoney(activeBudget.monthly_limit)} used (${Math.round(
                    activeBudget.progress * 100
                  )}%)`}
            </Text>
          </View>
        )}

        {showSavingGoal && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Saving Goal</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {savingGoals.length === 0 ? (
                <Text style={styles.mutedHint}>No saving goals yet. Add one under More → Saving Goals.</Text>
              ) : (
                savingGoals.map((goal) => (
                  <TouchableOpacity
                    key={goal.id}
                    style={[styles.chip, savingGoalId === goal.id && styles.chipActive]}
                    onPress={() => setSavingGoalId(goal.id)}
                  >
                    <Text style={[styles.chipText, savingGoalId === goal.id && styles.chipTextActive]}>
                      {goal.name}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        )}

        {showInvestment && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Investment</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {investments.length === 0 ? (
                <Text style={styles.mutedHint}>No investments yet. Add one under More → Investments.</Text>
              ) : (
                investments.map((inv) => (
                  <TouchableOpacity
                    key={inv.id}
                    style={[styles.chip, investmentId === inv.id && styles.chipActive]}
                    onPress={() => setInvestmentId(inv.id)}
                  >
                    <Text style={[styles.chipText, investmentId === inv.id && styles.chipTextActive]}>
                      {inv.name}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        )}

        {showToPerson && (
          <TextInput
            style={styles.input}
            placeholder={type === 'transfer_out' ? 'To person (e.g. Mom)' : 'From person (e.g. Dad)'}
            placeholderTextColor={Colors.textMuted}
            value={toPerson}
            onChangeText={setToPerson}
          />
        )}

        <TouchableOpacity
          style={[styles.saveButton, (loading || initialLoading) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading || initialLoading}
        >
          <Text style={styles.saveButtonText}>
            {loading
              ? 'Saving...'
              : initialLoading
                ? 'Loading...'
                : editingId
                  ? 'Save Changes'
                  : 'Save Transaction'}
          </Text>
        </TouchableOpacity>
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
    backgroundColor: Colors.surface,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: 'bold',
    color: Colors.text,
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  typeButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typeButtonText: {
    color: Colors.text,
    fontSize: FontSize.sm,
  },
  typeButtonTextActive: {
    color: Colors.surface,
  },
  form: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  amountInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    fontSize: FontSize.xxl,
    fontWeight: 'bold',
    textAlign: 'center',
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  fieldGroup: {
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  chipText: {
    color: Colors.text,
    fontSize: FontSize.sm,
  },
  chipTextActive: {
    color: Colors.surface,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  budgetHint: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  budgetHintText: { fontSize: FontSize.sm, fontWeight: '500' },
  mutedHint: { fontSize: FontSize.sm, color: Colors.textMuted, paddingVertical: Spacing.sm },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: Colors.surface,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
