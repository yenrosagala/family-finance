import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { useI18n } from '../../core/i18n';
import { shareMonthlyStatement, StatementFormat } from '../../services/reportService';

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string, locale = 'en-US'): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export default function ExportReportScreen() {
  const { t, locale } = useI18n();
  const [month, setMonth] = useState<string>(monthKey(new Date()));
  const [busy, setBusy] = useState<StatementFormat | null>(null);

  const download = async (format: StatementFormat) => {
    if (busy) return;
    setBusy(format);
    try {
      const [y, m] = month.split('-').map(Number);
      await shareMonthlyStatement(y, m, format);
    } catch (e) {
      Alert.alert(t('common.error'), (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.monthBar}>
        <TouchableOpacity
          onPress={() => setMonth((m) => {
            const [y, mo] = m.split('-').map(Number);
            return monthKey(new Date(y, mo - 2, 1));
          })}
        >
          <Text style={styles.monthNav}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthText}>{monthLabel(month, locale)}</Text>
        <TouchableOpacity
          onPress={() => setMonth((m) => {
            const [y, mo] = m.split('-').map(Number);
            return monthKey(new Date(y, mo, 1));
          })}
        >
          <Text style={styles.monthNav}>›</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>{t('reports.hint')}</Text>

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.button} onPress={() => download('xlsx')} disabled={!!busy}>
          {busy === 'xlsx' ? (
            <ActivityIndicator color={Colors.surface} />
          ) : (
            <Text style={styles.buttonText}>{t('reports.download_excel')}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => download('pdf')} disabled={!!busy}>
          {busy === 'pdf' ? (
            <ActivityIndicator color={Colors.surface} />
          ) : (
            <Text style={styles.buttonText}>{t('reports.download_pdf')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.md },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  monthNav: { fontSize: FontSize.title, color: Colors.primary, paddingHorizontal: Spacing.lg },
  monthText: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  hint: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  buttons: { gap: Spacing.md },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  buttonText: { color: Colors.surface, fontWeight: '700', fontSize: FontSize.md },
});