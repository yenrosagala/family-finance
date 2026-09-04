import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  RefreshControl,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { getUserHousehold, getHouseholdMembers } from '../../services/authService';
import { Household, HouseholdMember } from '../../models';

type MemberRow = HouseholdMember & { email?: string };

export default function HouseholdMembersScreen() {
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [house, mems] = await Promise.all([getUserHousehold(), getHouseholdMembers()]);
      setHousehold(house);
      setMembers(mems);
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

  const copyCode = async () => {
    if (!household?.invite_code) return;
    await Clipboard.setStringAsync(household.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={members}
      keyExtractor={(m) => m.user_id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <>
          <Text style={styles.title}>{household?.name ?? 'Household'}</Text>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Invite code</Text>
            <Text style={styles.code}>{household?.invite_code ?? '—'}</Text>
            <TouchableOpacity
              style={styles.copyButton}
              onPress={copyCode}
              disabled={!household?.invite_code}
            >
              <Text style={styles.copyText}>{copied ? 'Copied!' : 'Copy code'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>How to add a member</Text>
            <Text style={styles.infoText}>
              1. Share this invite code with a family member.{'\n'}
              2. They create an account in the app and choose &quot;Join Household&quot;.{'\n'}
              3. They enter this code — done. They share the same accounts, categories, and
              transactions.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Members</Text>
        </>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowName}>{item.display_name || 'Member'}</Text>
            {item.email ? <Text style={styles.rowEmail}>{item.email}</Text> : null}
          </View>
          <View style={[styles.rolePill, item.role === 'admin' && styles.rolePillAdmin]}>
            <Text
              style={[
                styles.roleText,
                item.role === 'admin' && styles.roleTextAdmin,
              ]}
            >
              {item.role === 'admin' ? 'Admin' : 'Member'}
            </Text>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>No members loaded yet.</Text>
      }
      ListFooterComponent={<View style={{ height: Spacing.xl }} />}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  title: { fontSize: FontSize.title, fontWeight: 'bold', color: Colors.text, marginBottom: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  cardLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  code: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    letterSpacing: 4,
    color: Colors.primary,
    marginBottom: Spacing.md,
  },
  copyButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  copyText: { color: Colors.surface, fontWeight: '600', fontSize: FontSize.md },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  infoText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  rowInfo: { flex: 1 },
  rowName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  rowEmail: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  rolePill: {
    backgroundColor: Colors.background,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  rolePillAdmin: { backgroundColor: '#DBEAFE' },
  roleText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: '600' },
  roleTextAdmin: { color: Colors.primary },
  empty: { textAlign: 'center', color: Colors.textMuted, padding: Spacing.lg },
});
