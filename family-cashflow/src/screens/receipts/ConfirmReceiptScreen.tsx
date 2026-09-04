import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { ParsedReceipt, ParsedLineItem, Category, Account } from '../../models';
import { saveReceipt } from '../../services/receiptService';
import { reportCorrection } from '../../services/categorizationService';

const SOURCE_LABEL: Record<string, string> = {
  exact: 'Exact',
  fuzzy: 'Fuzzy',
  fallback: 'Suggested',
  manual: 'Manual',
};

function confidenceColor(confidence: number) {
  if (confidence >= 0.7) return Colors.income;
  if (confidence >= 0.4) return Colors.transfer;
  return Colors.expense;
}

type Props = {
  receipt: ParsedReceipt;
  categories: Category[];
  accounts: Account[];
  onSaved: () => void;
  onCancel: () => void;
};

export default function ConfirmReceiptScreen({ receipt, categories, accounts, onSaved, onCancel }: Props) {
  const [merchant, setMerchant] = useState(receipt.merchant || '');
  const [date, setDate] = useState(receipt.txn_date);
  const [total, setTotal] = useState(String(receipt.total ?? ''));
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState<string | null>(accounts.length ? accounts[0].id : null);
  const [items, setItems] = useState<ParsedLineItem[]>(receipt.line_items || []);
  const [saving, setSaving] = useState(false);

  const expenseCategories = useMemo(() => categories.filter((c) => c.transaction_type === 'expense'), [categories]);

  const parsedTotal = parseFloat(total) || 0;
  const lineItemsSum = items.reduce((s, it) => s + (it.amount || 0), 0);
  const numTotal = parseFloat(total) || 0;

  const updateItem = (index: number, patch: Partial<ParsedLineItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const handleSave = async () => {
    if (!parsedTotal || parsedTotal <= 0) {
      Alert.alert('Error', 'Enter a valid total amount');
      return;
    }
    if (!accountId) {
      Alert.alert('Error', 'Select an account to pay from');
      return;
    }
    setSaving(true);
    try {
      const result = await saveReceipt({
        merchant_name: merchant || null,
        txn_date: date || new Date().toISOString().slice(0, 10),
        total: parsedTotal,
        from_account_id: accountId,
        category_id: items.find((it) => it.category_id)?.category_id || null,
        line_items: items.map((it) => ({
          raw_text: it.raw_text,
          normalized_text: it.normalized_text,
          amount: it.amount,
          category_id: it.category_id,
          categorization_source: it.categorization_source,
        })),
        receipt_fingerprint: receipt.receipt_fingerprint,
        note: note || null,
      });

      // Apply corrections back to the learning dictionary for fallback items
      for (const it of items) {
        if (it.categorization_source === 'fallback' && it.category_id) {
          await reportCorrection(it.raw_text, it.category_id).catch(() => {});
        }
      }

      Alert.alert('Saved', `Receipt saved as ${result.transaction.amount.toLocaleString()} expense`, [
        { text: 'OK', onPress: onSaved },
      ]);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Review receipt before saving</Text>
          <Text style={styles.bannerSub}>Categorization is automatic and may be wrong — adjust below.</Text>
        </View>

        {receipt.duplicate_check.is_duplicate && (
          <View style={styles.warnCard}>
            <Text style={styles.warnText}>
              ⚠ This looks like a duplicate receipt (same merchant, total, and item count as an existing entry).
            </Text>
          </View>
        )}

        {/* Header fields */}
        <View style={styles.card}>
          <Text style={styles.label}>Merchant</Text>
          <TextInput style={styles.input} value={merchant} onChangeText={setMerchant} placeholder="Store name" placeholderTextColor={Colors.textMuted} />
          <Text style={styles.label}>Date</Text>
          <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textMuted} />
          <Text style={styles.label}>Total (IDR)</Text>
          <TextInput style={styles.input} value={total} onChangeText={setTotal} keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.textMuted} />
          <Text style={styles.label}>Note (optional)</Text>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Note" placeholderTextColor={Colors.textMuted} />

          <Text style={styles.label}>Pay from</Text>
          <View style={styles.chipRow}>
            {accounts.map((acc) => (
              <TouchableOpacity
                key={acc.id}
                style={[styles.chip, accountId === acc.id && styles.chipActive]}
                onPress={() => setAccountId(acc.id)}
              >
                <Text style={[styles.chipText, accountId === acc.id && styles.chipTextActive]}>{acc.name}</Text>
              </TouchableOpacity>
            ))}
            {accounts.length === 0 && <Text style={styles.muted}>No accounts. Create one in More › Accounts first.</Text>}
          </View>
        </View>

        {/* Reconciliation */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Reconciliation</Text>
          <View style={styles.reconRow}>
            <Text style={styles.muted}>Items total</Text>
            <Text style={styles.reconVal}>{lineItemsSum.toLocaleString()}</Text>
          </View>
          <View style={styles.reconRow}>
            <Text style={styles.muted}>Printed total</Text>
            <Text style={styles.reconVal}>{numTotal.toLocaleString()}</Text>
          </View>
          <View style={styles.reconRow}>
            <Text style={styles.muted}>Status</Text>
            <Text style={[styles.reconStatus, Math.abs(lineItemsSum - numTotal) < 1 ? { color: Colors.income } : { color: Colors.expense }]}>
              {Math.abs(lineItemsSum - numTotal) < 1
                ? 'Reconciled'
                : `Mismatch (${(numTotal - lineItemsSum).toLocaleString()})`}
            </Text>
          </View>
        </View>

        {/* Line items */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Line items</Text>
          {items.map((item, index) => (
            <View key={index} style={styles.itemRow}>
              <View style={styles.itemHeader}>
                <TextInput
                  style={styles.itemName}
                  value={item.raw_text}
                  onChangeText={(t) => updateItem(index, { raw_text: t, normalized_text: t })}
                />
                <TextInput
                  style={styles.itemAmount}
                  value={String(item.amount)}
                  keyboardType="numeric"
                  onChangeText={(t) => updateItem(index, { amount: parseFloat(t) || 0 })}
                />
              </View>
              <View style={styles.itemMeta}>
                <View style={styles.categoryPicker}>
                  {expenseCategories.slice(0, 6).map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.miniChip, item.category_id === cat.id && styles.miniChipActive]}
                      onPress={() => updateItem(index, { category_id: cat.id, categorization_source: 'manual' })}
                    >
                      <Text style={[styles.miniChipText, item.category_id === cat.id && styles.miniChipTextActive]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.confRow}>
                  <Text style={[styles.source, { color: confidenceColor(item.confidence) }]}>
                    {SOURCE_LABEL[item.categorization_source || 'manual']} · {Math.round(item.confidence * 100)}%
                  </Text>
                  {item.categorization_source === 'fallback' && (
                    <Text style={styles.uncategorized}>Uncategorized</Text>
                  )}
                </View>
              </View>
            </View>
          ))}
          <TouchableOpacity
            style={styles.addItem}
            onPress={() => setItems((prev) => [...prev, { raw_text: '', normalized_text: null, amount: 0, category_id: null, category_name: null, category_color: null, categorization_source: 'manual', confidence: 1 }])}
          >
            <Text style={styles.addItemText}>+ Add line item</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={saving}>
            <Text style={styles.cancelText}>Discard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={Colors.surface} /> : <Text style={styles.saveText}>Save {parsedTotal ? parsedTotal.toLocaleString() : ''}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 40 },
  banner: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md },
  bannerTitle: { color: Colors.surface, fontWeight: '700', fontSize: FontSize.lg },
  bannerSub: { color: Colors.surface, opacity: 0.85, fontSize: FontSize.sm, marginTop: 2 },
  warnCard: { backgroundColor: '#FEF3C7', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md },
  warnText: { color: '#92400E', fontSize: FontSize.sm },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.sm, marginBottom: 4, fontWeight: '500' },
  input: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.text, fontSize: FontSize.sm },
  chipTextActive: { color: Colors.surface },
  muted: { fontSize: FontSize.sm, color: Colors.textMuted },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  reconRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  reconVal: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  reconStatus: { fontSize: FontSize.md, fontWeight: '600' },
  itemRow: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md, marginTop: Spacing.sm },
  itemHeader: { flexDirection: 'row', gap: Spacing.sm },
  itemName: { flex: 1, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.sm, fontSize: FontSize.md, color: Colors.text },
  itemAmount: { width: 90, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.sm, fontSize: FontSize.md, color: Colors.text, textAlign: 'right' },
  itemMeta: { marginTop: Spacing.sm },
  categoryPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  miniChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  miniChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  miniChipText: { fontSize: FontSize.xs, color: Colors.text },
  miniChipTextActive: { color: Colors.surface },
  confRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  source: { fontSize: FontSize.xs, fontWeight: '600' },
  uncategorized: { fontSize: FontSize.xs, color: Colors.expense, fontWeight: '600' },
  addItem: { padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  addItemText: { color: Colors.primary, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  cancelBtn: { flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center' },
  saveText: { color: Colors.surface, fontWeight: '700' },
});
