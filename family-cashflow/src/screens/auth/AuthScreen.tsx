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
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { signIn, signUp } from '../../services/authService';
import { DataSource, getDataSource, setDataSource, LOCAL_MODE_UNAVAILABLE_MSG } from '../../core/dataSource';

type AuthScreenProps = {
  onAuthSuccess: () => void;
};

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [mode, setMode] = useState<DataSource>('cloud');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
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
      Alert.alert('Local mode unavailable', LOCAL_MODE_UNAVAILABLE_MSG);
      return;
    }
    setMode(next);
    await setDataSource(next);
  };

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password, displayName || email.split('@')[0]);
      } else {
        await signIn(email, password);
      }
      onAuthSuccess();
    } catch (error: any) {
      Alert.alert('Error', error.message);
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
          <Text style={styles.title}>FamFin</Text>
          <Text style={styles.subtitle}>
            {isSignUp ? 'Create an account' : 'Sign in to your account'}
          </Text>
        </View>

        <Text style={styles.modeLabel}>Where should your data live?</Text>
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
              Cloud
            </Text>
            <Text style={[styles.modeDesc, mode === 'cloud' && styles.modeDescActive]}>
              Shared securely with your household. Requires internet.
            </Text>
            <Text style={[styles.modeChip, mode === 'cloud' && styles.modeChipActive]}>
              {mode === 'cloud' ? 'Selected' : 'Select'}
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
              Local
            </Text>
            <Text style={[styles.modeDesc, mode === 'local' && styles.modeDescActive]}>
              Stored only on this phone. Use on the mobile app only.
            </Text>
            <Text style={[styles.modeChip, mode === 'local' && styles.modeChipActive]}>
              {mode === 'local' ? 'Selected' : 'Select'}
            </Text>
          </TouchableOpacity>
        </View>

        {mode === 'local' && (
          <View style={styles.localNote}>
            <Text style={styles.localNoteText}>
              {'Local mode keeps all data on this device — no account sharing across devices. Register with a fresh email to start your local household.\n\nEvery new local household is auto-populated with 3 months of dummy data. Quick demo login: demo@local.family / demo1234'}
            </Text>
          </View>
        )}

        <View style={styles.form}>
          {isSignUp && (
            <TextInput
              style={styles.input}
              placeholder="Display Name"
              placeholderTextColor={Colors.textMuted}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => setIsSignUp(!isSignUp)}
          >
            <Text style={styles.switchText}>
              {isSignUp
                ? 'Already have an account? Sign In'
                : "Don't have an account? Sign Up"}
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