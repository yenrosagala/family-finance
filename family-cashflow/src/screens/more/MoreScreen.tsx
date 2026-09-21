import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { useI18n } from '../../core/i18n';

type MoreScreenProps = {
  onSignOut?: () => void;
  navigation: any;
};

export default function MoreScreen({ onSignOut, navigation }: MoreScreenProps) {
  const { t, lang, setLang } = useI18n();

  const sections = [
    {
      title: t('more.section_finance'),
      items: [
        { key: 'Budgets', title: t('nav.budgets'), subtitle: t('more.budgets_sub'), icon: '\uD83C\uDFAF' },
        { key: 'SavingGoals', title: t('nav.saving_goals'), subtitle: t('more.saving_goals_sub'), icon: '\uD83D\uDCB0' },
        { key: 'Investments', title: t('nav.investments'), subtitle: t('more.investments_sub'), icon: '\uD83D\uDCC8' },
        { key: 'Assets', title: t('nav.assets'), subtitle: t('more.assets_sub'), icon: '\uD83C\uDFE1' },
        { key: 'Liabilities', title: t('nav.liabilities'), subtitle: t('more.liabilities_sub'), icon: '\uD83D\uDCB5' },
        { key: 'NetWorth', title: t('nav.net_worth'), subtitle: t('more.net_worth_sub'), icon: '\u2696\uFE0F' },
        { key: 'ExportReport', title: t('nav.export_report'), subtitle: t('more.export_report_sub'), icon: '\uD83D\uDCE5' },
      ],
    },
    {
      title: t('more.section_settings'),
      items: [
        { key: 'Household', title: t('nav.household'), subtitle: t('more.household_sub'), icon: '\uD83C\uDFE0' },
        { key: 'Accounts', title: t('nav.accounts'), subtitle: t('more.accounts_sub'), icon: '\uD83D\uDCB3' },
        { key: 'Categories', title: t('nav.categories'), subtitle: t('more.categories_sub'), icon: '\uD83C\uDF5F' },
      ],
    },
  ];

  const currentLang = lang === 'en' ? 'English' : 'Bahasa Indonesia';

  const changeLanguage = () => {
    Alert.alert(t('more.language'), undefined, [
      { text: 'English', onPress: () => setLang('en') },
      { text: 'Bahasa Indonesia', onPress: () => setLang('id') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const confirmSignOut = () => {
    if (!onSignOut) return;
    Alert.alert(t('more.sign_out_title'), t('more.sign_out_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('more.sign_out'), style: 'destructive', onPress: onSignOut },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('tab.more')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.list}>
          <TouchableOpacity style={styles.row} onPress={changeLanguage}>
            <Text style={styles.rowIcon}>🌐</Text>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>{t('more.language')}</Text>
              <Text style={styles.rowSubtitle}>{currentLang} · {t('more.language_sub')}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          {sections.map((section) => (
            <View key={section.title}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.items.map((item) => (
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
          ))}
        </View>
        <View style={styles.signOutWrap}>
          <TouchableOpacity style={styles.signOut} onPress={confirmSignOut}>
            <Text style={styles.signOutText}>{t('more.sign_out')}</Text>
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
  scrollContent: { flexGrow: 1 },
  list: { padding: Spacing.md },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
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
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  signOutText: { color: Colors.danger, fontWeight: '600', fontSize: FontSize.md },
});
