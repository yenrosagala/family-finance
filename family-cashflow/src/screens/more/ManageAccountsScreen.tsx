import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  RefreshControl,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { getAccounts, createAccount, deleteAccount } from '../../services/transactionService';
import { Account } from '../../models';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, AccountType } from '../../constants/categories';

export default function ManageAccountsScreen() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('cash');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setAccounts(await getAccounts());
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleAdd = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Enter an account name');
      return;
    }
    setLoading(true);
    try {
      await createAccount({ name: name.trim(), type });
      setName('');
      await load();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (account: Account) => {
    Alert.alert(
      'Delete Account',
      `Delete "${account.name}"? Its transactions are kept, but it won't accept new ones.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(account.id);
              await load();
            } catch (e) {
              Alert.alert('Error', (e as Error).message);
            }
          },
        },
      ]
    );
  };

  const total = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <View style={styles.container}>
      <FlatList
        data={accounts}
        keyExtractor={(a) => a.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            <View style={styles.addCard}>
              <TextInput
                style={styles.input}
                placeholder="Account name (e.g. Bank BCA)"
                placeholderTextColor={Colors.textMuted}
                value={name}
                onChangeText={setName}
              />
              <View style={styles.chipRow}>
                {ACCOUNT_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, type === t && styles.chipActive]}
                    onPress={() => setType(t)}
                  >
                    <Text style={[styles.chipText, type === t && styles.chipTextActive]}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.addButton} onPress={handleAdd} disabled={loading}>
                <Text style={styles.addButtonText}>{loading ? 'Adding...' : 'Add Account'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Combined balance</Text>
              <Text style={styles.totalAmount}>{total.toLocaleString()}</Text>
            </View>
            {accounts.length === 0 && (
              <Text style={styles.empty}>No accounts yet. Add your first one above.</Text>
            )}
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowType}>
                {ACCOUNT_TYPE_LABELS[item.type as AccountType] ?? item.type}
              </Text>
            </View>
            <Text style={styles.rowBalance}>{item.balance.toLocaleString()}</Text>
            <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
              <Text style={styles.deleteText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  addCard: {
    backgroundColor: Colors.surface,
    margin: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.text, fontSize: FontSize.sm },
  chipTextActive: { color: Colors.surface },
  addButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  addButtonText: { color: Colors.surface, fontWeight: '600', fontSize: FontSize.md },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  totalLabel: { color: Colors.textSecondary, fontSize: FontSize.sm },
  totalAmount: { fontWeight: '600', fontSize: FontSize.md, color: Colors.text },
  empty: { textAlign: 'center', color: Colors.textMuted, padding: Spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  rowInfo: { flex: 1 },
  rowName: { fontSize: FontSize.md, fontWeight: '500', color: Colors.text },
  rowType: { fontSize: FontSize.sm, color: Colors.textSecondary, textTransform: 'capitalize' },
  rowBalance: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  deleteBtn: {
    marginLeft: Spacing.md,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: Colors.danger, fontWeight: '700' },
});
