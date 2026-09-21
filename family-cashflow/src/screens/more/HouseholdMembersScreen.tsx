import React, { useCallback, useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
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
import { getUserHousehold, getHouseholdMembers, getCurrentUser, refreshInviteCode } from '../../services/authService';
import { Household, HouseholdMember } from '../../models';
import { useI18n } from '../../core/i18n';

type MemberRow = HouseholdMember & { email?: string };

export default function HouseholdMembersScreen() {
  const isFocused = useIsFocused();
  const { t } = useI18n();
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = useCallback(async () => {
    try {
      const [house, mems, me] = await Promise.all([
        getUserHousehold(),
        getHouseholdMembers(),
        getCurrentUser(),
      ]);
      setHousehold(house);
      setMembers(mems);
      setIsAdmin(
        mems.some((m) => m.role === 'admin' && m.user_id === me?.id)
      );
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

  const copyCode = async () => {
    if (!household?.invite_code) return;
    await Clipboard.setStringAsync(household.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const refreshCode = () => {
    if (!isAdmin) return;
    Alert.alert(t('home.refresh_code_title'), t('home.refresh_code_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('home.refresh_code'),
        onPress: async () => {
          try {
            const code = await refreshInviteCode();
            setHousehold((h) => (h ? { ...h, invite_code: code } : h));
          } catch (e) {
            Alert.alert(t('common.error'), (e as Error).message);
          }
        },
      },
    ]);
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
          <Text style={styles.title}>{household?.name ?? t('home.member')}</Text>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('home.invite_code')}</Text>
            <Text style={styles.code}>{household?.invite_code ?? '—'}</Text>
            <View style={styles.codeActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={copyCode}
                disabled={!household?.invite_code}
              >
                <Text style={styles.copyText}>{copied ? t('home.copied') : t('home.copy_code')}</Text>
              </TouchableOpacity>
              {isAdmin ? (
                <TouchableOpacity
                  style={[styles.actionButton, styles.refreshButton]}
                  onPress={refreshCode}
                  disabled={!household?.invite_code}
                >
                  <Text style={styles.refreshText}>{t('home.refresh_code')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>{t('home.how_to')}</Text>
            <Text style={styles.infoText}>{t('home.how_to_text')}</Text>
          </View>

          <Text style={styles.sectionTitle}>{t('home.members')}</Text>
        </>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowName}>{item.display_name || t('home.member')}</Text>
            {item.email ? <Text style={styles.rowEmail}>{item.email}</Text> : null}
          </View>
          <View style={[styles.rolePill, item.role === 'admin' && styles.rolePillAdmin]}>
            <Text
              style={[
                styles.roleText,
                item.role === 'admin' && styles.roleTextAdmin,
              ]}
            >
              {item.role === 'admin' ? t('home.admin') : t('home.member')}
            </Text>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>{t('home.empty')}</Text>
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
  copyText: { color: Colors.surface, fontWeight: '600', fontSize: FontSize.md },
  codeActions: { flexDirection: 'row', gap: Spacing.sm },
  actionButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  refreshButton: { backgroundColor: Colors.border },
  refreshText: { color: Colors.text, fontWeight: '600', fontSize: FontSize.md },
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
