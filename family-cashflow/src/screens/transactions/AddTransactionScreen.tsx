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
import { createTransaction, getAccounts, getCategories } from '../../services/transactionService';
import { Account, Category } from '../../models';
import { TRANSACTION_TYPES, TRANSACTION_TYPE_LABELS, TransactionType } from '../../constants/categories';

type AddTransactionScreenProps = {
  navigation: any;
};

export default function AddTransactionScreen({ navigation }: AddTransactionScreenProps) {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [fromAccountId, setFromAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadCategories();
  }, [type]);

  const loadData = async () => {
    try {
      const accountsData = await getAccounts();
      setAccounts(accountsData);
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

    setLoading(true);
    try {
      await createTransaction({
        type,
        amount: parseFloat(amount),
        txn_date: date,
        note: note || null,
        category_id: categoryId,
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        to_person: null,
        investment_id: null,
        saving_goal_id: null,
        merchant_name: null,
        receipt_image_url: null,
        categorization_source: 'manual',
        receipt_fingerprint: null,
      });

      Alert.alert('Success', 'Transaction added!', [
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

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Add Transaction</Text>
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

        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.saveButtonText}>
            {loading ? 'Saving...' : 'Save Transaction'}
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
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: Colors.surface,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
