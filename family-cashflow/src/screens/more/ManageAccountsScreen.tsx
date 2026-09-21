import React, { useCallback, useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
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
import { formatMoney, parseAmount } from '../../core/format';
import { getAccounts, createAccount, deleteAccount } from '../../services/transactionService';
import { Account } from '../../models';
import { ACCOUNT_TYPES, AccountType } from '../../constants/categories';
import { useI18n } from '../../core/i18n';

export default function ManageAccountsScreen() {
  const isFocused = useIsFocused();
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('cash');
  const [openingBalance, setOpeningBalance] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setAccounts(await getAccounts());
    } catch (e) {
      Alert.alert(t('common.error'), (e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (isFocused) load();
  }, [load, isFocused]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleAdd = async () => {
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('acc.err_name'));
      return;
    }
    setLoading(true);
    try {
      const balance = parseAmount(openingBalance);
      await createAccount({
        name: name.trim(),
        type,
        openingBalance: openingBalance.trim() && !isNaN(balance) && balance > 0 ? balance : undefined,
      });
      setName('');
      setOpeningBalance('');
      await load();
    } catch (e) {
      Alert.alert(t('common.error'), (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (account: Account) => {
    Alert.alert(
      t('acc.delete_title'),
      t('acc.delete_msg', { name: account.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(account.id);
              await load();
            } catch (e) {
              Alert.alert(t('common.error'), (e as Error).message);
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
                placeholder={t('acc.name_placeholder')}
                placeholderTextColor={Colors.textMuted}
                value={name}
                onChangeText={setName}
              />
              <TextInput
                style={styles.input}
                placeholder={t('acc.opening_placeholder')}
                placeholderTextColor={Colors.textMuted}
                value={openingBalance}
                onChangeText={setOpeningBalance}
                keyboardType="numeric"
              />
              <View style={styles.chipRow}>
                {ACCOUNT_TYPES.map((ty) => (
                  <TouchableOpacity
                    key={ty}
                    style={[styles.chip, type === ty && styles.chipActive]}
                    onPress={() => setType(ty)}
                  >
                    <Text style={[styles.chipText, type === ty && styles.chipTextActive]}>
                      {t(`atype.${ty}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.addButton} onPress={handleAdd} disabled={loading}>
                <Text style={styles.addButtonText}>{loading ? t('common.saving') : t('acc.add')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('acc.combined')}</Text>
              <Text style={styles.totalAmount}>{formatMoney(total)}</Text>
            </View>
            {accounts.length === 0 && (
              <Text style={styles.empty}>{t('acc.empty')}</Text>
            )}
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowType}>
                {t(`atype.${item.type}`).startsWith('atype.') ? item.type : t(`atype.${item.type}`)}
              </Text>
            </View>
            <Text style={styles.rowBalance}>{formatMoney(item.balance)}</Text>
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
