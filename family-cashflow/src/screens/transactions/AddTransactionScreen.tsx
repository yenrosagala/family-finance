import React, { useState, useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
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
import { formatMoney, parseAmount } from '../../core/format';
import { createTransaction, updateTransaction, deleteTransaction, getTransactions, getAccounts, getCategories } from '../../services/transactionService';
import { getBudgets, BudgetProgress } from '../../services/budgetService';
import { getSavingGoals, SavingGoalProgress } from '../../services/savingGoalService';
import { getInvestments, InvestmentProgress } from '../../services/investmentService';
import { Account, Category } from '../../models';
import { TRANSACTION_TYPES, TransactionType } from '../../constants/categories';
import { useI18n } from '../../core/i18n';

type AddTransactionScreenProps = {
  navigation: any;
  route?: any;
};

export default function AddTransactionScreen({ navigation, route }: AddTransactionScreenProps) {
  const { t } = useI18n();
  const isFocused = useIsFocused();
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
    if (isFocused) loadData();
  }, [isFocused]);

  useEffect(() => {
    if (editingId && isFocused) {
      loadTransaction(editingId);
    }
  }, [editingId, isFocused]);

  const loadTransaction = async (id: string) => {
    try {
      const all = await getTransactions();
      const tx = all.find((t) => t.id === id);
      if (!tx) {
        Alert.alert(t('common.error'), t('add.not_found'));
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
      Alert.alert(t('common.error'), error.message);
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
    const num = parseAmount(amount);
    if (!Number.isFinite(num) || num <= 0) {
      Alert.alert(t('common.error'), t('add.err_amount'));
      return;
    }
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    if (!dateMatch) {
      Alert.alert(t('common.error'), t('add.err_date'));
      return;
    }
    const parsedDate = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
    if (
      parsedDate.getFullYear() !== Number(dateMatch[1]) ||
      parsedDate.getMonth() !== Number(dateMatch[2]) - 1 ||
      parsedDate.getDate() !== Number(dateMatch[3])
    ) {
      Alert.alert(t('common.error'), t('add.err_date'));
      return;
    }
    if (type === 'saving' && !savingGoalId) {
      Alert.alert(t('common.error'), t('add.err_goal'));
      return;
    }
    if (type === 'investment' && !investmentId) {
      Alert.alert(t('common.error'), t('add.err_investment'));
      return;
    }

    setLoading(true);
    try {
      const payload = {
        type,
        amount: num,
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

      Alert.alert(t('common.success'), editingId ? t('add.success_updated') : t('add.success_added'), [
        {
          text: t('common.ok'),
          onPress: () => {
            if (editingId) {
              navigation.goBack();
            } else {
              setAmount('');
              setNote('');
              setDate(new Date().toISOString().split('T')[0]);
              setCategoryId(null);
              setSavingGoalId(null);
              setInvestmentId(null);
              setToPerson('');
            }
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = () => {
    if (!editingId) return;
    Alert.alert(t('add.delete_title'), t('add.delete_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            await deleteTransaction(editingId);
            Alert.alert(t('common.success'), t('add.success_deleted'), [
              { text: t('common.ok'), onPress: () => navigation.goBack() },
            ]);
          } catch (error: any) {
            Alert.alert(t('common.error'), error.message);
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
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
        <Text style={styles.title}>{editingId ? t('add.edit_title') : t('add.title')}</Text>
      </View>

      <View style={styles.typeSelector}>
        {TRANSACTION_TYPES.map((tr) => (
          <TouchableOpacity
            key={tr}
            style={[styles.typeButton, type === tr && styles.typeButtonActive]}
            onPress={() => setType(tr)}
          >
            <Text style={[styles.typeButtonText, type === tr && styles.typeButtonTextActive]}>
              {t(`type.${tr}`)}
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
          placeholder={t('add.note_placeholder')}
          placeholderTextColor={Colors.textMuted}
          value={note}
          onChangeText={setNote}
        />

        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={Colors.textMuted}
          value={date}
          onChangeText={setDate}
        />

        {showFromAccount && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('add.from_account')}</Text>
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
            <Text style={styles.label}>{t('add.to_account')}</Text>
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
            <Text style={styles.label}>{t('add.category')}</Text>
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
                ? t('add.budget_over', {
                    cat: activeBudget.category_name ?? '',
                    amt: formatMoney(activeBudget.spent - activeBudget.monthly_limit),
                  })
                : t('add.budget_used', {
                    spent: formatMoney(activeBudget.spent),
                    limit: formatMoney(activeBudget.monthly_limit),
                    pct: Math.round(activeBudget.progress * 100),
                  })}
            </Text>
          </View>
        )}

        {showSavingGoal && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('add.saving_goal')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {savingGoals.length === 0 ? (
                <Text style={styles.mutedHint}>{t('add.no_saving_goals')}</Text>
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
            <Text style={styles.label}>{t('add.investment')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {investments.length === 0 ? (
                <Text style={styles.mutedHint}>{t('add.no_investments')}</Text>
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
            placeholder={type === 'transfer_out' ? t('add.to_person_out') : t('add.from_person_in')}
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
              ? t('common.saving')
              : initialLoading
                ? t('common.loading')
                : editingId
                  ? t('add.save_changes')
                  : t('add.save_transaction')}
          </Text>
        </TouchableOpacity>

        {editingId && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={confirmDelete}
            disabled={loading || initialLoading}
          >
            <Text style={styles.deleteButtonText}>{t('add.delete_transaction')}</Text>
          </TouchableOpacity>
        )}
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
  deleteButton: {
    backgroundColor: Colors.danger,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  deleteButtonText: { color: Colors.surface, fontWeight: '600', fontSize: FontSize.md },
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
