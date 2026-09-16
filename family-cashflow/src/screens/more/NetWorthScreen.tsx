import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { formatMoney } from '../../core/format';
import { getNetWorth, NetWorthCurrent, NetWorthHistoryPoint } from '../../services/netWorthService';

function Row({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, color ? { color } : {}]}>{formatMoney(value)}</Text>
    </View>
  );
}

export default function NetWorthScreen() {
  const [current, setCurrent] = useState<NetWorthCurrent | null>(null);
  const [history, setHistory] = useState<NetWorthHistoryPoint[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getNetWorth();
      setCurrent(data.current);
      setHistory(data.history);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!current) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const netWorthColor = current.net_worth >= 0 ? Colors.income : Colors.expense;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Net worth hero */}
      <View style={[styles.heroCard, { backgroundColor: current.net_worth >= 0 ? Colors.primary : Colors.danger }]}>
        <Text style={styles.heroLabel}>Net Worth</Text>
        <Text style={styles.heroAmount}>{formatMoney(current.net_worth)}</Text>
        <Text style={styles.heroSub}>Assets − Liabilities</Text>
      </View>

      {/* Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Assets</Text>
        <View style={styles.card}>
          <Row label="Cash & Accounts" value={current.accounts} color={Colors.income} />
          <View style={styles.divider} />
          <Row label="Investments" value={current.investments} color={Colors.investment} />
          <View style={styles.divider} />
          <Row label="Physical Assets" value={current.assets} color={Colors.saving} />
          <View style={[styles.divider, { borderBottomWidth: 1 }]} />
          <Row label="Total Assets" value={current.total_assets} color={Colors.income} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Liabilities</Text>
        <View style={styles.card}>
          <Row label="Total Liabilities" value={current.liabilities} color={Colors.expense} />
        </View>
      </View>

      {/* History */}
      {history.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Monthly snapshots</Text>
          <View style={styles.card}>
            {history.slice(-6).reverse().map((h) => (
              <View key={h.month}>
                <View style={styles.historyRow}>
                  <Text style={styles.historyMonth}>
                    {new Date(h.month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </Text>
                  <Text style={[styles.historyNW, { color: h.net_worth >= 0 ? Colors.income : Colors.expense }]}>
                    {formatMoney(h.net_worth)}
                  </Text>
                </View>
                <View style={styles.divider} />
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ height: Spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  loadingText: { color: Colors.textSecondary, fontSize: FontSize.md },
  errorText: { color: Colors.danger, fontSize: FontSize.md, textAlign: 'center' },
  heroCard: {
    margin: Spacing.md,
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  heroLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm },
  heroAmount: { color: '#fff', fontSize: 36, fontWeight: 'bold', marginTop: Spacing.xs },
  heroSub: { color: 'rgba(255,255,255,0.6)', fontSize: FontSize.xs, marginTop: Spacing.xs },
  section: { marginHorizontal: Spacing.md, marginTop: Spacing.lg },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.md },
  rowLabel: { fontSize: FontSize.md, color: Colors.text },
  rowValue: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  divider: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm },
  historyMonth: { fontSize: FontSize.sm, color: Colors.textSecondary },
  historyNW: { fontSize: FontSize.sm, fontWeight: '600' },
});
