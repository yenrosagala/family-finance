import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';

type MoreScreenProps = {
  onSignOut?: () => void;
  navigation: any;
};

export default function MoreScreen({ onSignOut, navigation }: MoreScreenProps) {
  const items = [
    { key: 'Accounts', title: 'Accounts', subtitle: 'Manage cash, bank, e-wallet, cards', icon: '\uD83D\uDCB3' },
    { key: 'Categories', title: 'Categories', subtitle: 'Add income & expense categories', icon: '\uD83C\uDF5F' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>
      </View>
      <View style={styles.list}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.row}
            onPress={() => navigation.navigate(item.key)}
          >
            <Text style={styles.rowIcon}>{item.icon}</Text>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.signOutWrap}>
        <TouchableOpacity style={styles.signOut} onPress={onSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.lg, paddingTop: Spacing.xl, backgroundColor: Colors.surface },
  title: { fontSize: FontSize.xxl, fontWeight: 'bold', color: Colors.text },
  list: { padding: Spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  rowIcon: { fontSize: 22, marginRight: Spacing.md },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  rowSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  chevron: { fontSize: 26, color: Colors.textMuted },
  signOutWrap: { padding: Spacing.md, marginTop: 'auto' },
  signOut: {
    backgroundColor: '#FEE2E2',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  signOutText: { color: Colors.danger, fontWeight: '600', fontSize: FontSize.md },
});
