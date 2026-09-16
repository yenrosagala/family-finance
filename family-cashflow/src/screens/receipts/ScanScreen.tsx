import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { scanReceipt } from '../../services/receiptService';
import { getCategories, getAccounts } from '../../services/transactionService';
import { ParsedReceipt, Category, Account } from '../../models';
import ConfirmReceiptScreen from './ConfirmReceiptScreen';

type PickedImage = { uri: string; base64?: string } | null;

export default function ScanScreen() {
  const [scanning, setScanning] = useState(false);
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Shared pipeline for both camera and library: image -> OCR -> parse -> confirm.
  const processImage = async (picked: PickedImage) => {
    if (!picked) return;
    setScanning(true);
    // Fetch options first so offline parse can categorize line items locally.
    const [cats, accs] = await Promise.all([getCategories().catch(() => []), getAccounts().catch(() => [])]);
    try {
      const parsed = await scanReceipt(picked, cats);
      setReceipt(parsed);
      setCategories(cats);
      setAccounts(accs);
    } catch (e) {
      // Fall back to an empty receipt so the confirm screen still explains itself
      const err = e as Error;
      setReceipt({
        merchant: null,
        txn_date: new Date().toISOString().slice(0, 10),
        total: null,
        line_items: [],
        receipt_fingerprint: null,
        reconciliation: { line_items_count: 0, line_items_sum: 0, printed_total: null, is_reconciled: null, discrepancy: null },
        duplicate_check: { is_duplicate: false, existing_transaction_id: null },
      });
      setCategories(cats);
      setAccounts(accs);
      console.warn('Scan/parse warning:', err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access to take a receipt photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets && result.assets.length > 0 ? result.assets[0] : null;
    await processImage(asset ? { uri: asset.uri, base64: asset.base64 ?? undefined } : null);
  };

  const handleChoosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;
    if (!result.assets || result.assets.length === 0) {
      Alert.alert('No image selected', 'Please select a receipt photo.');
      return;
    }
    const asset = result.assets[0];
    await processImage({ uri: asset.uri, base64: asset.base64 ?? undefined });
  };

  const reset = () => {
    setReceipt(null);
  };

  if (receipt) {
    return (
      <ConfirmReceiptScreen
        receipt={receipt}
        categories={categories}
        accounts={accounts}
        onSaved={reset}
        onCancel={reset}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Scan Receipt</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderIcon}>📷</Text>
          <Text style={styles.placeholderTitle}>Receipt OCR</Text>
          <Text style={styles.placeholderText}>
            Take a photo of a receipt with your camera or choose one from your library. The app reads
            the text with the PaddleOCR-VL model, extracts the line items, and suggests categories.
            You always review before it's saved.
          </Text>
          <Text style={styles.hint}>Works offline — the parsed receipt becomes an expense transaction.</Text>
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.scanBtn, { flex: 1 }]} onPress={handleTakePhoto} disabled={scanning}>
            {scanning ? (
              <ActivityIndicator color={Colors.surface} />
            ) : (
              <Text style={styles.scanBtnText}>Take photo</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.libraryBtn} onPress={handleChoosePhoto} disabled={scanning}>
            <Text style={styles.libraryBtnText}>Choose photo</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.lg, paddingTop: Spacing.xl, backgroundColor: Colors.surface },
  title: { fontSize: FontSize.xxl, fontWeight: 'bold', color: Colors.text },
  body: { padding: Spacing.md, flexGrow: 1 },
  placeholder: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  placeholderIcon: { fontSize: 44, marginBottom: Spacing.sm },
  placeholderTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  placeholderText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.md,
    lineHeight: 18,
  },
  buttonRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  scanBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  scanBtnText: { color: Colors.surface, fontWeight: '700', fontSize: FontSize.md },
  libraryBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  libraryBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSize.md },
});