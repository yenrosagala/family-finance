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
  getAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
} from '../../services/assetService';
import { Asset } from '../../models';

export default function AssetsScreen() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('property');
  const [valueText, setValueText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setAssets(await getAssets());
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
    setType('property');
    setValueText('');
    setModalVisible(true);
  };

  const openEdit = (a: Asset) => {
    setEditing(a);
    setName(a.name);
    setType(a.type);
    setValueText(String(a.current_value));
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Enter a name');
      return;
    }
    setSaving(true);
    try {
      const value = valueText.trim() ? Number(valueText) : undefined;
      if (editing) await updateAsset(editing.id, { name: name.trim(), type, current_value: value });
      else await createAsset({ name: name.trim(), type, current_value: value });
      setModalVisible(false);
      await load();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (a: Asset) => {
    Alert.alert('Delete asset', `Remove "${a.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAsset(a.id);
            await load();
          } catch (e) {
            Alert.alert('Error', (e as Error).message);
          }
        },
      },
    ]);
  };

  const total = assets.reduce((s, a) => s + a.current_value, 0);

  const renderItem = ({ item }: { item: Asset }) => (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowName}>{item.name}</Text>
        <Text style={styles.rowType}>{ASSET_TYPE_LABELS[item.type] || item.type}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowValue}>{formatMoney(item.current_value)}</Text>
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
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total assets</Text>
        <Text style={styles.totalValue}>{formatMoney(total)}</Text>
      </View>

      <FlatList
        data={assets}
        keyExtractor={(a) => a.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          assets.length === 0 ? <Text style={styles.empty}>No assets yet (property, vehicles, etc.).</Text> : null
        }
        ListFooterComponent={
          <TouchableOpacity style={styles.addButton} onPress={openAdd}>
            <Text style={styles.addButtonText}>+ New Asset</Text>
          </TouchableOpacity>
        }
        renderItem={renderItem}
        contentContainerStyle={{ padding: Spacing.md }}
      />

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Asset' : 'New Asset'}</Text>
            <TextInput style={styles.input} placeholder="Name (e.g. Toyota Avanza)" placeholderTextColor={Colors.textMuted} value={name} onChangeText={setName} />
            <Text style={styles.label}>Type</Text>
            <View style={styles.chipWrap}>
              {ASSET_TYPES.map((t) => (
                <TouchableOpacity key={t} style={[styles.chip, type === t && styles.chipActive]} onPress={() => setType(t)}>
                  <Text style={[styles.chipText, type === t && styles.chipTextActive]}>{ASSET_TYPE_LABELS[t]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="Current value" placeholderTextColor={Colors.textMuted} keyboardType="numeric" value={valueText} onChangeText={setValueText} />
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
  totalCard: { backgroundColor: Colors.primary, margin: Spacing.md, padding: Spacing.lg, borderRadius: BorderRadius.lg, alignItems: 'center' },
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
