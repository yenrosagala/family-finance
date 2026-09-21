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
import { getCategories, createCategory } from '../../services/transactionService';
import { Category } from '../../models';
import { useI18n } from '../../core/i18n';

const PALETTE = ['#10B981', '#EF4444', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899'];

export default function ManageCategoriesScreen() {
  const isFocused = useIsFocused();
  const { t } = useI18n();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [color, setColor] = useState(PALETTE[1]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setCategories(await getCategories());
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
      Alert.alert(t('common.error'), t('cat.err_name'));
      return;
    }
    setLoading(true);
    try {
      await createCategory({
        name: name.trim(),
        transaction_type: type,
        color,
      });
      setName('');
      await load();
    } catch (e) {
      Alert.alert(t('common.error'), (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: Category }) => (
    <View style={styles.row}>
      <View style={[styles.swatch, { backgroundColor: item.color || Colors.textMuted }]} />
      <Text style={styles.rowName}>{item.name}</Text>
      <Text style={[styles.rowType, { color: item.transaction_type === 'income' ? Colors.income : Colors.expense }]}>
        {item.transaction_type === 'income' ? t('cat.income') : t('cat.expense')}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={categories}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            <View style={styles.addCard}>
              <TextInput
                style={styles.input}
                placeholder={t('cat.name_placeholder')}
                placeholderTextColor={Colors.textMuted}
                value={name}
                onChangeText={setName}
              />
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.typeChip, type === 'expense' && styles.typeChipActive]}
                  onPress={() => setType('expense')}
                >
                  <Text style={[styles.chipText, type === 'expense' && styles.chipTextActive]}>{t('cat.expense')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeChip, type === 'income' && styles.typeChipActive]}
                  onPress={() => setType('income')}
                >
                  <Text style={[styles.chipText, type === 'income' && styles.chipTextActive]}>{t('cat.income')}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.swatchRow}>
                {PALETTE.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.swatchOption, { backgroundColor: c }, color === c && styles.swatchActive]}
                    onPress={() => setColor(c)}
                  />
                ))}
              </View>
              <TouchableOpacity style={styles.addButton} onPress={handleAdd} disabled={loading}>
                <Text style={styles.addButtonText}>{loading ? t('common.saving') : t('cat.add')}</Text>
              </TouchableOpacity>
            </View>
            {categories.length === 0 && (
              <Text style={styles.empty}>{t('cat.empty')}</Text>
            )}
          </>
        }
        renderItem={renderItem}
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
  chipRow: { flexDirection: 'row', gap: Spacing.sm },
  typeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.text, fontSize: FontSize.sm },
  chipTextActive: { color: Colors.surface },
  swatchRow: { flexDirection: 'row', gap: Spacing.sm },
  swatchOption: { width: 32, height: 32, borderRadius: 16 },
  swatchActive: { borderWidth: 3, borderColor: Colors.text },
  addButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  addButtonText: { color: Colors.surface, fontWeight: '600', fontSize: FontSize.md },
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
  swatch: { width: 20, height: 20, borderRadius: 10, marginRight: Spacing.md },
  rowName: { flex: 1, fontSize: FontSize.md, fontWeight: '500', color: Colors.text },
  rowType: { fontSize: FontSize.sm, fontWeight: '600' },
});
