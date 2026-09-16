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
import {
  getLiabilities,
  createLiability,
  updateLiability,
  deleteLiability,
  LIABILITY_TYPES,
  LIABILITY_TYPE_LABELS,
} from '../../services/liabilityService';
import { Liability } from '../../models';

export default function LiabilitiesScreen() {
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Liability | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('mortgage');
  const [balanceText, setBalanceText] = useState('');
  const [rateText, setRateText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLiabilities(await getLiabilities());
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
    setType('mortgage');
    setBalanceText('');
    setRateText('');
    setModalVisible(true);
  };

  const openEdit = (l: Liability) => {
    setEditing(l);
    setName(l.name);
    setType(l.type);
    setBalanceText(String(l.current_balance));
    setRateText(l.interest_rate == null ? '' : String(l.interest_rate));
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Enter a name');
      return;
    }
    setSaving(true);
    try {
      const balance = balanceText.trim() ? Number(balanceText) : undefined;
      const rate = rateText.trim() ? Number(rateText) : null;
      if (editing) await updateLiability(editing.id, { name: name.trim(), type, current_balance: balance, interest_rate: rate });
      else await createLiability({ name: name.trim(), type, current_balance: balance, interest_rate: rate });
      setModalVisible(false);
      await load();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (l: Liability) => {
    Alert.alert('Delete liability', `Remove "${l.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLiability(l.id);
            await load();
          } catch (e) {
            Alert.alert('Error', (e as Error).message);
          }
        },
      },
    ]);
  };

  const total = liabilities.reduce((s, l) => s + l.current_balance, 0);

  const renderItem = ({ item }: { item: Liability }) => (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowName}>{item.name}</Text>
        <Text style={styles.rowType}>
          {LIABILITY_TYPE_LABELS[item.type] || item.type}
          {item.interest_rate != null ? ` · ${item.interest_rate}%` : ''}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowValue}>{formatMoney(item.current_balance)}</Text>
        <View style={styles.rowButtons}>
          <TouchableOpacity style={[styles.smallButton, styles.editBtn]} onPress={() => openEdit(item)}>
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.smallButton, styles.deleteBtn]} onPress={() => handleDelete(item)}>
            <Text style={styles.deleteBtnText}>Del</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.totalCard, { backgroundColor: Colors.danger }]}>
        <Text style={styles.totalLabel}>Total liabilities</Text>
        <Text style={styles.totalValue}>{formatMoney(total)}</Text>
      </View>

      <FlatList
        data={liabilities}
        keyExtractor={(l) => l.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          liabilities.length === 0 ? <Text style={styles.empty}>No liabilities yet (mortgage, loans, etc.).</Text> : null
        }
        ListFooterComponent={
          <TouchableOpacity style={styles.addButton} onPress={openAdd}>
            <Text style={styles.addButtonText}>+ New Liability</Text>
          </TouchableOpacity>
        }
        renderItem={renderItem}
        contentContainerStyle={{ padding: Spacing.md }}
      />

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Liability' : 'New Liability'}</Text>
            <TextInput style={styles.input} placeholder="Name (e.g. Home Mortgage)" placeholderTextColor={Colors.textMuted} value={name} onChangeText={setName} />
            <Text style={styles.label}>Type</Text>
            <View style={styles.chipWrap}>
              {LIABILITY_TYPES.map((t) => (
                <TouchableOpacity key={t} style={[styles.chip, type === t && styles.chipActive]} onPress={() => setType(t)}>
                  <Text style={[styles.chipText, type === t && styles.chipTextActive]}>{LIABILITY_TYPE_LABELS[t]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="Current balance" placeholderTextColor={Colors.textMuted} keyboardType="numeric" value={balanceText} onChangeText={setBalanceText} />
            <TextInput style={styles.input} placeholder="Interest rate % (optional)" placeholderTextColor={Colors.textMuted} keyboardType="numeric" value={rateText} onChangeText={setRateText} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
                <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
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
  totalCard: { margin: Spacing.md, padding: Spacing.lg, borderRadius: BorderRadius.lg, alignItems: 'center' },
  totalLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm },
  totalValue: { color: Colors.surface, fontSize: FontSize.xxl, fontWeight: 'bold', marginTop: Spacing.xs },
  empty: { textAlign: 'center', color: Colors.textMuted, padding: Spacing.lg, marginTop: Spacing.lg },
  row: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLeft: { flex: 1 },
  rowName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  rowType: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowValue: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  rowButtons: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  smallButton: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.md },
  editBtn: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  editBtnText: { color: Colors.text, fontWeight: '600', fontSize: FontSize.xs },
  deleteBtn: { backgroundColor: '#FEE2E2' },
  deleteBtnText: { color: Colors.danger, fontWeight: '600', fontSize: FontSize.xs },
  addButton: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  addButtonText: { color: Colors.surface, fontWeight: '600', fontSize: FontSize.md },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: Spacing.lg },
  modal: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, gap: Spacing.md },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text },
  label: { fontSize: FontSize.sm, fontWeight: '500', color: Colors.textSecondary },
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
