import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { signIn, signUp } from '../../services/authService';
import { DataSource, getDataSource, setDataSource } from '../../core/dataSource';
import { useI18n } from '../../core/i18n';

type AuthScreenProps = {
  onAuthSuccess: () => void;
};

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const { t } = useI18n();
  const [isSignUp, setIsSignUp] = useState(false);
  const [mode, setMode] = useState<DataSource>('cloud');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [householdMode, setHouseholdMode] = useState<'create' | 'join'>('create');
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    getDataSource().then((saved) => {
      if (active) setMode(saved);
    });
    return () => { active = false; };
  }, []);

  const chooseMode = async (next: DataSource) => {
    if (next === 'local' && Platform.OS === 'web') {
      Alert.alert(t('auth.local_mode_unavailable'), t('auth.local_mode_msg'));
      return;
    }
    setMode(next);
    await setDataSource(next);
  };

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert(t('common.error'), t('auth.fill_fields'));
      return;
    }
    if (isSignUp && mode === 'cloud') {
      if (householdMode === 'create' && !householdName.trim()) {
        Alert.alert(t('common.error'), t('auth.household_name_error'));
        return;
      }
      if (householdMode === 'join' && !inviteCode.trim()) {
        Alert.alert(t('common.error'), t('auth.invite_code_error'));
        return;
      }
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const household: Parameters<typeof signUp>[3] =
          mode === 'cloud' && householdMode === 'join'
            ? { mode: 'join', inviteCode: inviteCode.trim().toUpperCase() }
            : { mode: 'create', householdName: householdName.trim() };
        await signUp(email, password, displayName || email.split('@')[0], household);
      } else {
        await signIn(email, password);
      }
      onAuthSuccess();
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Image source={require('../../../assets/FamFin Logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>{'Family Finance\nManagement'}</Text>
          <Text style={styles.subtitle}>
            {isSignUp ? t('auth.subtitle_create') : t('auth.subtitle_login')}
          </Text>
        </View>

        <Text style={styles.modeLabel}>{t('auth.data_live')}</Text>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeCard, mode === 'cloud' && styles.modeCardActive]}
            onPress={() => chooseMode('cloud')}
            activeOpacity={0.8}
          >
            <Text style={[styles.modeIcon, mode === 'cloud' && styles.modeIconActive]}>
              {'\u2601\uFE0F'}
            </Text>
            <Text style={[styles.modeTitle, mode === 'cloud' && styles.modeTitleActive]}>
              {t('auth.cloud')}
            </Text>
            <Text style={[styles.modeDesc, mode === 'cloud' && styles.modeDescActive]}>
              {t('auth.cloud_desc')}
            </Text>
            <Text style={[styles.modeChip, mode === 'cloud' && styles.modeChipActive]}>
              {mode === 'cloud' ? t('auth.selected') : t('auth.select')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modeCard,
              mode === 'local' && styles.modeCardActive,
              Platform.OS === 'web' && styles.modeCardDisabled,
            ]}
            onPress={() => chooseMode('local')}
            activeOpacity={0.8}
          >
            <Text style={[styles.modeIcon, mode === 'local' && styles.modeIconActive]}>
              {'\uD83D\uDCF1'}
            </Text>
            <Text style={[styles.modeTitle, mode === 'local' && styles.modeTitleActive]}>
              {t('auth.local')}
            </Text>
            <Text style={[styles.modeDesc, mode === 'local' && styles.modeDescActive]}>
              {t('auth.local_desc')}
            </Text>
            <Text style={[styles.modeChip, mode === 'local' && styles.modeChipActive]}>
              {mode === 'local' ? t('auth.selected') : t('auth.select')}
            </Text>
          </TouchableOpacity>
        </View>

        {mode === 'local' && (
          <View style={styles.localNote}>
            <Text style={styles.localNoteText}>{t('auth.local_note')}</Text>
          </View>
        )}

        <View style={styles.form}>
          {isSignUp && (
            <TextInput
              style={styles.input}
              placeholder={t('auth.display_name')}
              placeholderTextColor={Colors.textMuted}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder={t('auth.email')}
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder={t('auth.password')}
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {isSignUp && mode === 'cloud' && (
            <>
              <View style={styles.modeSelector}>
                <TouchableOpacity
                  style={[styles.modeButton, householdMode === 'create' && styles.modeButtonActive]}
                  onPress={() => setHouseholdMode('create')}
                >
                  <Text style={[styles.modeButtonText, householdMode === 'create' && styles.modeButtonTextActive]}>
                    {t('auth.create_household')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeButton, householdMode === 'join' && styles.modeButtonActive]}
                  onPress={() => setHouseholdMode('join')}
                >
                  <Text style={[styles.modeButtonText, householdMode === 'join' && styles.modeButtonTextActive]}>
                    {t('auth.join_household')}
                  </Text>
                </TouchableOpacity>
              </View>

              {householdMode === 'create' ? (
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.household_placeholder')}
                  placeholderTextColor={Colors.textMuted}
                  value={householdName}
                  onChangeText={setHouseholdName}
                />
              ) : (
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.invite_placeholder')}
                  placeholderTextColor={Colors.textMuted}
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  autoCapitalize="characters"
                />
              )}
            </>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? t('common.loading') : isSignUp ? t('auth.sign_up') : t('auth.sign_in')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => setIsSignUp(!isSignUp)}
          >
            <Text style={styles.switchText}>
              {isSignUp ? t('auth.have_account') : t('auth.no_account')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: Spacing.sm,
  },
  logo: {
    width: 112,
    height: 112,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  modeLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  modeRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  modeCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  modeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: '#EFF6FF',
  },
  modeCardDisabled: {
    opacity: 0.5,
  },
  modeIcon: {
    fontSize: 22,
    marginBottom: Spacing.xs,
  },
  modeIconActive: {
    opacity: 1,
  },
  modeTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  modeTitleActive: {
    color: Colors.primary,
  },
  modeDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    lineHeight: 16,
  },
  modeDescActive: {
    color: Colors.text,
  },
  modeChip: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  modeChipActive: {
    color: Colors.surface,
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  localNote: {
    backgroundColor: '#FFF7ED',
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  localNoteText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  form: {
    gap: Spacing.md,
  },
  modeSelector: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  modeButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  modeButtonText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  modeButtonTextActive: {
    color: Colors.surface,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.surface,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  switchButton: {
    alignItems: 'center',
    padding: Spacing.sm,
  },
  switchText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
  },
});