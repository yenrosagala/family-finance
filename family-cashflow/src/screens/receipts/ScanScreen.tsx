import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Permissions as ReactNativePermissions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { scanReceipt } from '../../services/receiptService';
import { getCategories, getAccounts } from '../../services/transactionService';
import { ParsedReceipt, Category, Account } from '../../models';
import ConfirmReceiptScreen from './ConfirmReceiptScreen';

export default function ScanScreen() {
  const [scanning, setScanning] = useState(false);
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const handleScan = async () => {
    // Request camera permission if not already granted
    const { status: cameraPermission } = await Permissions.getAsync(ReactNativePermissions.Camera);
    const canUseCamera = cameraPermission === 'granted';

    // Open image picker — camera if permission granted, otherwise library
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaType: canUseCamera
        ? ImagePicker.MediaTypeOptions.Images
        : ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (result.canceled) {
      return;
    }
    if (!result.assets || result.assets.length === 0) {
      Alert.alert('No image selected', 'Please select a receipt photo.');
      return;
    }

    const imageUri = result.assets[0].uri;
    setScanning(true);
    try {
      const parsed = await scanReceipt(imageUri);
      const [cats, accs] = await Promise.all([getCategories(), getAccounts()]);
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
      setCategories(await getCategories().catch(() => []));
      setAccounts(await getAccounts().catch(() => []));
      console.warn('Scan/parse warning:', err.message);
    } finally {
      setScanning(false);
    }
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
            Choose a receipt photo from your library. The app reads the text via ML Kit
            on-device text recognition, extracts the line items, and suggests categories.
            You always review before it's saved.
          </Text>
          <Text style={styles.hint}>Tap 'Scan' to choose a photo.</Text>
        </View>
        <TouchableOpacity style={styles.scanBtn} onPress={handleScan} disabled={scanning}>
          {scanning ? (
            <ActivityIndicator color={Colors.surface} />
          ) : (
            <Text style={styles.scanBtnText}>Scan receipt</Text>
          )}
        </TouchableOpacity>
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
  scanBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  scanBtnText: { color: Colors.surface, fontWeight: '700', fontSize: FontSize.md },
});