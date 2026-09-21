import React, { useCallback, useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  RefreshControl,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { formatMoney, parseAmount } from '../../core/format';
import {
  getSavingGoals,
  createSavingGoal,
  updateSavingGoal,
  deleteSavingGoal,
  formatDateOnly,
  SavingGoalProgress,
} from '../../services/savingGoalService';
import { getAccounts, createTransaction } from '../../services/transactionService';
import { Account } from '../../models';
import { useI18n } from '../../core/i18n';

export default function SavingGoalsScreen() {
  const isFocused = useIsFocused();
  const { t } = useI18n();
  const [goals, setGoals] = useState<SavingGoalProgress[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // add/edit
  const [editVisible, setEditVisible] = useState(false);
  const [editing, setEditing] = useState<SavingGoalProgress | null>(null);
  const [name, setName] = useState('');
  const [targetText, setTargetText] = useState('');
  const [dateText, setDateText] = useState('');
  const [linkedAccountId, setLinkedAccountId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // contribute
  const [contribGoal, setContribGoal] = useState<SavingGoalProgress | null>(null);
  const [contribVisible, setContribVisible] = useState(false);
  const [contribAmount, setContribAmount] = useState('');
  const [contribFromAccount, setContribFromAccount] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [goalData, accountData] = await Promise.all([getSavingGoals(), getAccounts()]);
      setGoals(goalData);
      setAccounts(accountData);
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

  const openAdd = () => {
    setEditing(null);
    setName('');
    setTargetText('');
    setDateText('');
    setLinkedAccountId(null);
    setEditVisible(true);
  };

  const openEdit = (g: SavingGoalProgress) => {
    setEditing(g);
    setName(g.name);
    setTargetText(String(g.target_amount));
    setDateText(formatDateOnly(g.target_date) || '');
    setLinkedAccountId(g.linked_account_id);
    setEditVisible(true);
  };

  const handleSaveGoal = async () => {
    const target = parseAmount(targetText);
    if (!name.trim() || !Number.isFinite(target) || target <= 0) {
      Alert.alert(t('common.error'), t('goals.err_target'));
      return;
    }
    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        target_amount: target,
        target_date: dateText.trim() || null,
        linked_account_id: linkedAccountId,
      };
      if (editing) await updateSavingGoal(editing.id, input);
      else await createSavingGoal(input);
      setEditVisible(false);
      await load();
    } catch (e) {
      Alert.alert(t('common.error'), (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openContribute = (g: SavingGoalProgress) => {
    setContribGoal(g);
    setContribAmount('');
    setContribFromAccount(accounts.length ? accounts[0].id : null);
    setContribVisible(true);
  };

  const handleContribute = async () => {
    const amount = parseAmount(contribAmount);
    if (!contribGoal || !Number.isFinite(amount) || amount <= 0 || !contribFromAccount) {
      Alert.alert(t('common.error'), t('goals.err_contribute'));
      return;
    }
    setSaving(true);
    try {
      await createTransaction({
        type: 'saving',
        amount,
        txn_date: new Date().toISOString().slice(0, 10),
        note: `Contribution to ${contribGoal.name}`,
        category_id: null,
        from_account_id: contribFromAccount,
        to_account_id: null,
        to_person: null,
        investment_id: null,
        saving_goal_id: contribGoal.id,
        merchant_name: null,
        receipt_image_url: null,
        categorization_source: 'manual',
        receipt_fingerprint: null,
      });
      setContribVisible(false);
      await load();
    } catch (e) {
      Alert.alert(t('common.error'), (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (g: SavingGoalProgress) => {
    Alert.alert(t('goals.delete_title'), t('goals.delete_msg', { name: g.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSavingGoal(g.id);
            await load();
          } catch (e) {
            Alert.alert(t('common.error'), (e as Error).message);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: SavingGoalProgress }) => (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.rowLeft}>
          <Text style={styles.rowName}>{item.name}</Text>
          {item.account_name ? <Text style={styles.rowAccount}>→ {item.account_name}</Text> : null}
        </View>
        <View style={styles.rowActions}>
          <Text style={styles.rowAmount}>
            {formatMoney(item.current_amount)} / {formatMoney(item.target_amount)}
          </Text>
          {item.current_amount >= item.target_amount ? (
            <Text style={[styles.completeBadge]}>{t('goals.reached')}</Text>
          ) : (
            <Text style={styles.rowPct}>{Math.round(item.progress * 100)}%</Text>
          )}
        </View>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.min(100, Math.round(item.progress * 100))}%`,
              backgroundColor: item.progress >= 1 ? Colors.secondary : Colors.saving,
            },
          ]}
        />
      </View>
      <Text style={styles.remaining}>
        {item.progress >= 1 ? t('goals.done_over', { amt: formatMoney(item.remaining) }) : t('goals.to_go', { amt: formatMoney(item.remaining) })}
      </Text>
      <View style={styles.rowButtons}>
        <TouchableOpacity style={[styles.smallButton, styles.primaryBtn]} onPress={() => openContribute(item)}>
          <Text style={styles.primaryBtnText}>{t('goals.contribute')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.smallButton, styles.editBtn]} onPress={() => openEdit(item)}>
          <Text style={styles.editBtnText}>{t('common.edit')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.smallButton, styles.deleteBtn]} onPress={() => handleDelete(item)}>
          <Text style={styles.deleteBtnText}>{t('common.delete')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const accountPicker = (value: string | null, onChange: (id: string | null) => void) => (
    <View>
      <Text style={styles.label}>{t('goals.linked_account')}</Text>
      <View style={styles.chipWrap}>
        <TouchableOpacity style={[styles.chip, value === null && styles.chipActive]} onPress={() => onChange(null)}>
          <Text style={[styles.chipText, value === null && styles.chipTextActive]}>{t('common.none')}</Text>
        </TouchableOpacity>
        {accounts.map((a) => (
          <TouchableOpacity
            key={a.id}
            style={[styles.chip, value === a.id && styles.chipActive]}
            onPress={() => onChange(a.id)}
          >
            <Text style={[styles.chipText, value === a.id && styles.chipTextActive]}>{a.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={goals}
        keyExtractor={(g) => g.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          goals.length === 0 ? <Text style={styles.empty}>{t('goals.empty')}</Text> : null
        }
        ListFooterComponent={
          <TouchableOpacity style={styles.addButton} onPress={openAdd}>
            <Text style={styles.addButtonText}>+ {t('goals.new')}</Text>
          </TouchableOpacity>
        }
        renderItem={renderItem}
        contentContainerStyle={{ padding: Spacing.md }}
      />

      <Modal visible={editVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editing ? t('goals.edit') : t('goals.new')}</Text>
            <TextInput style={styles.input} placeholder={t('goals.name_placeholder')} placeholderTextColor={Colors.textMuted} value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder={t('goals.target_placeholder')} placeholderTextColor={Colors.textMuted} keyboardType="numeric" value={targetText} onChangeText={setTargetText} />
            <TextInput style={styles.input} placeholder={t('goals.date_placeholder')} placeholderTextColor={Colors.textMuted} value={dateText} onChangeText={setDateText} />
            {accountPicker(linkedAccountId, setLinkedAccountId)}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setEditVisible(false)}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveGoal} disabled={saving}>
                <Text style={styles.saveText}>{saving ? t('common.saving') : t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={contribVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t('goals.contribute_to', { name: contribGoal?.name ?? '' })}</Text>
            <TextInput style={styles.input} placeholder={t('common.amount')} placeholderTextColor={Colors.textMuted} keyboardType="numeric" value={contribAmount} onChangeText={setContribAmount} autoFocus />
            <Text style={styles.label}>{t('goals.from_account')}</Text>
            <View style={styles.chipWrap}>
              {accounts.map((a) => (
                <TouchableOpacity key={a.id} style={[styles.chip, contribFromAccount === a.id && styles.chipActive]} onPress={() => setContribFromAccount(a.id)}>
                  <Text style={[styles.chipText, contribFromAccount === a.id && styles.chipTextActive]}>{a.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setContribVisible(false)}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleContribute} disabled={saving}>
                <Text style={styles.saveText}>{saving ? t('common.saving') : t('goals.contribute')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  empty: { textAlign: 'center', color: Colors.textMuted, padding: Spacing.lg, marginTop: Spacing.lg },
  row: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rowLeft: { flex: 1 },
  rowName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  rowAccount: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  rowActions: { alignItems: 'flex-end' },
  rowAmount: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  rowPct: { fontSize: FontSize.xs, color: Colors.saving, marginTop: 2 },
  completeBadge: { fontSize: FontSize.xs, color: Colors.secondary, fontWeight: '600', marginTop: 2 },
  track: { height: 10, borderRadius: 5, backgroundColor: Colors.border, marginTop: Spacing.sm, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  remaining: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: Spacing.sm },
  rowButtons: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  smallButton: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, alignItems: 'center' },
  primaryBtn: { backgroundColor: Colors.primary },
  primaryBtnText: { color: Colors.surface, fontWeight: '600', fontSize: FontSize.sm },
  editBtn: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  editBtnText: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
  deleteBtn: { backgroundColor: '#FEE2E2' },
  deleteBtnText: { color: Colors.danger, fontWeight: '600', fontSize: FontSize.sm },
  addButton: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  addButtonText: { color: Colors.surface, fontWeight: '600', fontSize: FontSize.md },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: Spacing.lg },
  modal: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, gap: Spacing.md },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text },
  label: { fontSize: FontSize.sm, fontWeight: '500', color: Colors.textSecondary, marginTop: Spacing.xs },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.text, fontSize: FontSize.sm },
  chipTextActive: { color: Colors.surface },
  modalActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  cancelButton: { flex: 1, padding: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.background, alignItems: 'center' },
  cancelText: { color: Colors.textSecondary, fontWeight: '600' },
  saveButton: { flex: 1, padding: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  saveText: { color: Colors.surface, fontWeight: '600' },
});
