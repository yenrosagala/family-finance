import React, { useCallback, useEffect, useState } from 'react';
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
import { formatMoney } from '../../core/format';
import { getInvestments, createInvestment, updateInvestment, deleteInvestment, InvestmentProgress } from '../../services/investmentService';
import { getAccounts, createTransaction } from '../../services/transactionService';
import { Account } from '../../models';

const TYPES = ['stocks', 'mutual_fund', 'gold', 'crypto', 'property', 'other'];
const TYPE_LABELS: Record<string, string> = {
  stocks: 'Stocks',
  mutual_fund: 'Mutual Fund',
  gold: 'Gold',
  crypto: 'Crypto',
  property: 'Property',
  other: 'Other',
};

export default function InvestmentsScreen() {
  const [investments, setInvestments] = useState<InvestmentProgress[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // add/edit metadata
  const [editVisible, setEditVisible] = useState(false);
  const [editing, setEditing] = useState<InvestmentProgress | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('stocks');
  const [startingValue, setStartingValue] = useState('');
  const [saving, setSaving] = useState(false);

  // mark-to-market
  const [marketGoal, setMarketGoal] = useState<InvestmentProgress | null>(null);
  const [marketVisible, setMarketVisible] = useState(false);
  const [marketValue, setMarketValue] = useState('');

  // contribute
  const [contribGoal, setContribGoal] = useState<InvestmentProgress | null>(null);
  const [contribVisible, setContribVisible] = useState(false);
  const [contribAmount, setContribAmount] = useState('');
  const [contribFromAccount, setContribFromAccount] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [invData, accountData] = await Promise.all([getInvestments(), getAccounts()]);
      setInvestments(invData);
      setAccounts(accountData);
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

  const openAdd = () => {
    setEditing(null);
    setName('');
    setType('stocks');
    setStartingValue('');
    setEditVisible(true);
  };

  const openEdit = (inv: InvestmentProgress) => {
    setEditing(inv);
    setName(inv.name);
    setType(inv.type);
    setStartingValue(String(inv.current_value));
    setEditVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Enter a name');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        // Editing just metadata + optional current value mark-to-market.
        const cv = startingValue.trim() ? Number(startingValue) : undefined;
        await updateInvestment(editing.id, { name: name.trim(), type, current_value: cv });
      } else {
        const cv = startingValue.trim() ? Number(startingValue) : undefined;
        await createInvestment({ name: name.trim(), type, current_value: Number.isFinite(cv) ? cv : 0 });
      }
      setEditVisible(false);
      await load();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openMarket = (inv: InvestmentProgress) => {
    setMarketGoal(inv);
    setMarketValue(String(inv.current_value));
    setMarketVisible(true);
  };

  const handleMarket = async () => {
    const value = Number(marketValue);
    if (!marketGoal || !value || value < 0) {
      Alert.alert('Error', 'Enter a valid current value');
      return;
    }
    setSaving(true);
    try {
      await updateInvestment(marketGoal.id, { current_value: value });
      setMarketVisible(false);
      await load();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openContribute = (inv: InvestmentProgress) => {
    setContribGoal(inv);
    setContribAmount('');
    setContribFromAccount(accounts.length ? accounts[0].id : null);
    setContribVisible(true);
  };

  const handleContribute = async () => {
    const amount = Number(contribAmount);
    if (!contribGoal || !amount || amount <= 0 || !contribFromAccount) {
      Alert.alert('Error', 'Enter a valid amount and choose an account');
      return;
    }
    setSaving(true);
    try {
      await createTransaction({
        type: 'investment',
        amount,
        txn_date: new Date().toISOString().slice(0, 10),
        note: `Contribution to ${contribGoal.name}`,
        category_id: null,
        from_account_id: contribFromAccount,
        to_account_id: null,
        to_person: null,
        investment_id: contribGoal.id,
        saving_goal_id: null,
        merchant_name: null,
        receipt_image_url: null,
        categorization_source: 'manual',
        receipt_fingerprint: null,
      });
      setContribVisible(false);
      await load();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (inv: InvestmentProgress) => {
    Alert.alert('Delete investment', `Remove "${inv.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteInvestment(inv.id);
            await load();
          } catch (e) {
            Alert.alert('Error', (e as Error).message);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: InvestmentProgress }) => {
    const gainColor = item.gain_loss >= 0 ? Colors.income : Colors.expense;
    return (
      <View style={styles.row}>
        <View style={styles.rowTop}>
          <View style={styles.rowLeft}>
            <Text style={styles.rowName}>{item.name}</Text>
            <Text style={styles.rowType}>{TYPE_LABELS[item.type] || item.type}</Text>
          </View>
          <Text style={[styles.rowGain, { color: gainColor }]}>
            {item.gain_loss >= 0 ? '+' : ''}{formatMoney(item.gain_loss)} ({(item.gain_loss_pct * 100).toFixed(1)}%)
          </Text>
        </View>
        <View style={styles.valueRow}>
          <Text style={styles.valueLabel}>Current value</Text>
          <Text style={styles.valueAmount}>{formatMoney(item.current_value)}</Text>
        </View>
        <Text style={styles.investedText}>Invested: {formatMoney(item.total_invested)}</Text>
        <View style={styles.rowButtons}>
          <TouchableOpacity style={[styles.smallButton, styles.primaryBtn]} onPress={() => openContribute(item)}>
            <Text style={styles.primaryBtnText}>Contribute</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.smallButton, styles.primaryBtn, { backgroundColor: Colors.secondary }]} onPress={() => openMarket(item)}>
            <Text style={styles.primaryBtnText}>Update value</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.smallButton, styles.editBtn]} onPress={() => openEdit(item)}>
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.smallButton, styles.deleteBtn]} onPress={() => handleDelete(item)}>
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={investments}
        keyExtractor={(inv) => inv.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          investments.length === 0 ? <Text style={styles.empty}>No investments yet. Add one to start tracking.</Text> : null
        }
        ListFooterComponent={
          <TouchableOpacity style={styles.addButton} onPress={openAdd}>
            <Text style={styles.addButtonText}>+ New Investment</Text>
          </TouchableOpacity>
        }
        renderItem={renderItem}
        contentContainerStyle={{ padding: Spacing.md }}
      />

      {/* Add / edit metadata + starting/current value */}
      <Modal visible={editVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Investment' : 'New Investment'}</Text>
            <TextInput style={styles.input} placeholder="Name (e.g. Index Fund)" placeholderTextColor={Colors.textMuted} value={name} onChangeText={setName} />
            <Text style={styles.label}>Type</Text>
            <View style={styles.chipWrap}>
              {TYPES.map((t) => (
                <TouchableOpacity key={t} style={[styles.chip, type === t && styles.chipActive]} onPress={() => setType(t)}>
                  <Text style={[styles.chipText, type === t && styles.chipTextActive]}>{TYPE_LABELS[t]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder={editing ? 'Current value' : 'Starting value (optional)'}
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              value={startingValue}
              onChangeText={setStartingValue}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setEditVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
                <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Mark-to-market */}
      <Modal visible={marketVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Update value — {marketGoal?.name}</Text>
            <TextInput style={styles.input} placeholder="Current value" placeholderTextColor={Colors.textMuted} keyboardType="numeric" value={marketValue} onChangeText={setMarketValue} autoFocus />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setMarketVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleMarket} disabled={saving}>
                <Text style={styles.saveText}>{saving ? 'Saving...' : 'Update'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Contribute */}
      <Modal visible={contribVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Contribute to {contribGoal?.name}</Text>
            <TextInput style={styles.input} placeholder="Amount" placeholderTextColor={Colors.textMuted} keyboardType="numeric" value={contribAmount} onChangeText={setContribAmount} autoFocus />
            <Text style={styles.label}>From account</Text>
            <View style={styles.chipWrap}>
              {accounts.map((a) => (
                <TouchableOpacity key={a.id} style={[styles.chip, contribFromAccount === a.id && styles.chipActive]} onPress={() => setContribFromAccount(a.id)}>
                  <Text style={[styles.chipText, contribFromAccount === a.id && styles.chipTextActive]}>{a.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setContribVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleContribute} disabled={saving}>
                <Text style={styles.saveText}>{saving ? 'Saving...' : 'Contribute'}</Text>
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
  row: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rowLeft: { flex: 1 },
  rowName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  rowType: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  rowGain: { fontSize: FontSize.sm, fontWeight: '700' },
  valueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  valueLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  valueAmount: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  investedText: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  rowButtons: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, flexWrap: 'wrap' },
  smallButton: { flex: 1, minWidth: 90, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, alignItems: 'center' },
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
