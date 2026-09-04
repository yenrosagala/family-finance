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
import { getBudgets, createBudget, updateBudget, deleteBudget, BudgetProgress } from '../../services/budgetService';
import { getCategories } from '../../services/transactionService';
import { Category } from '../../models';

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function BudgetsScreen() {
  const [month, setMonth] = useState<string>(monthKey(new Date()));
  const [budgets, setBudgets] = useState<BudgetProgress[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // add/edit modal
  const [modalVisible, setModalVisible] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<BudgetProgress | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [limitText, setLimitText] = useState('');
  const [isRecurring, setIsRecurring] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getBudgets(month);
      setBudgets(data.budgets);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openAdd = async () => {
    setEditing(null);
    setSelectedCategoryId(null);
    setLimitText('');
    setIsRecurring(true);
    try {
      setCategories((await getCategories('expense')).filter((c) => !budgets.some((b) => b.category_id === c.id)));
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    }
    setModalVisible(true);
  };

  const openEdit = (b: BudgetProgress) => {
    setEditing(b);
    setSelectedCategoryId(b.category_id);
    setLimitText(String(b.monthly_limit));
    setIsRecurring(b.is_recurring);
    setModalVisible(true);
  };

  const handleSave = async () => {
    const limit = Number(limitText);
    if (!selectedCategoryId || !limit || limit <= 0) {
      Alert.alert('Error', 'Choose a category and enter a valid amount');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateBudget(editing.id, { monthly_limit: limit, is_recurring: isRecurring });
      } else {
        await createBudget({ category_id: selectedCategoryId, monthly_limit: limit, is_recurring: isRecurring });
      }
      setModalVisible(false);
      await load();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (b: BudgetProgress) => {
    Alert.alert('Delete budget', `Remove budget for ${b.category_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBudget(b.id);
            await load();
          } catch (e) {
            Alert.alert('Error', (e as Error).message);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: BudgetProgress }) => {
    const pct = Math.round(item.progress * 100);
    const barColor = item.over_budget ? Colors.expense : item.category_color || Colors.primary;
    return (
      <TouchableOpacity style={styles.row} onPress={() => openEdit(item)} onLongPress={() => handleDelete(item)}>
        <View style={styles.rowHeader}>
          <Text style={[styles.rowName, { color: item.category_color || Colors.text }]}>{item.category_name}</Text>
          <Text style={[styles.rowAmount, { color: item.over_budget ? Colors.expense : Colors.text }]}>
            {formatMoney(item.spent)} / {formatMoney(item.monthly_limit)}
          </Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(100, pct)}%`, backgroundColor: barColor }]} />
        </View>
        <View style={styles.rowFooter}>
          <Text style={[styles.rowStatus, { color: item.over_budget ? Colors.expense : Colors.textSecondary }]}>
            {item.over_budget ? `Over by ${formatMoney(item.spent - item.monthly_limit)} (${pct}%)` : `${pct}% used, ${formatMoney(item.remaining)} left`}
          </Text>
          <Text style={[styles.rowBadge, item.is_recurring ? styles.recurringBadge : styles.monthBadge]}>
            {item.is_recurring ? 'Recurring' : 'One-off'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.monthBar}>
        <TouchableOpacity onPress={() => setMonth((m) => {
          const [y, mo] = m.split('-').map(Number);
          return monthKey(new Date(y, mo - 2, 1));
        })}>
          <Text style={styles.monthNav}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthText}>{monthLabel(month)}</Text>
        <TouchableOpacity onPress={() => setMonth((m) => {
          const [y, mo] = m.split('-').map(Number);
          return monthKey(new Date(y, mo, 1));
        })}>
          <Text style={styles.monthNav}>›</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={budgets}
        keyExtractor={(b) => b.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          budgets.length === 0 ? (
            <Text style={styles.empty}>No budgets for {monthLabel(month)}. Add one to track spending.</Text>
          ) : null
        }
        ListFooterComponent={
          <TouchableOpacity style={styles.addButton} onPress={openAdd}>
            <Text style={styles.addButtonText}>+ New Budget</Text>
          </TouchableOpacity>
        }
        renderItem={renderItem}
        contentContainerStyle={{ padding: Spacing.md }}
      />

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Budget' : 'New Budget'}</Text>
            {!editing && (
              <FlatList
                data={categories}
                keyExtractor={(c) => c.id}
                style={{ maxHeight: 220 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.catOption, selectedCategoryId === item.id && styles.catOptionActive]}
                    onPress={() => setSelectedCategoryId(item.id)}
                  >
                    <View style={[styles.catSwatch, { backgroundColor: item.color || Colors.textMuted }]} />
                    <Text style={[styles.catText, selectedCategoryId === item.id && styles.catTextActive]}>{item.name}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TextInput
              style={styles.input}
              placeholder="Monthly limit (e.g. 1500000)"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              value={limitText}
              onChangeText={setLimitText}
            />
            <View style={styles.chipRow}>
              <TouchableOpacity style={[styles.chip, isRecurring && styles.chipActive]} onPress={() => setIsRecurring(true)}>
                <Text style={[styles.chipText, isRecurring && styles.chipTextActive]}>Every month</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.chip, !isRecurring && styles.chipActive]} onPress={() => setIsRecurring(false)}>
                <Text style={[styles.chipText, !isRecurring && styles.chipTextActive]}>This month only</Text>
              </TouchableOpacity>
            </View>
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
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  monthNav: { fontSize: FontSize.xxl, color: Colors.primary, paddingHorizontal: Spacing.md },
  monthText: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text },
  empty: { textAlign: 'center', color: Colors.textMuted, padding: Spacing.lg, marginTop: Spacing.lg },
  row: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowName: { fontSize: FontSize.md, fontWeight: '600' },
  rowAmount: { fontSize: FontSize.sm, fontWeight: '600' },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.border,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  fill: { height: 10, borderRadius: 5 },
  rowFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  rowStatus: { fontSize: FontSize.xs },
  rowBadge: { fontSize: FontSize.xs, fontWeight: '600', paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  recurringBadge: { color: Colors.primary, backgroundColor: '#DBEAFE' },
  monthBadge: { color: Colors.warning, backgroundColor: Colors.warningLight },
  addButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  addButtonText: { color: Colors.surface, fontWeight: '600', fontSize: FontSize.md },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modal: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  catOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  catOptionActive: { backgroundColor: '#DBEAFE' },
  catSwatch: { width: 18, height: 18, borderRadius: 9, marginRight: Spacing.sm },
  catText: { fontSize: FontSize.md, color: Colors.text },
  catTextActive: { fontWeight: '600' },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  chipRow: { flexDirection: 'row', gap: Spacing.sm },
  chip: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.text, fontSize: FontSize.sm },
  chipTextActive: { color: Colors.surface },
  modalActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  cancelButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  cancelText: { color: Colors.textSecondary, fontWeight: '600' },
  saveButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  saveText: { color: Colors.surface, fontWeight: '600' },
});
