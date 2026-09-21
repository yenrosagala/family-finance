import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import AuthScreen from './src/screens/auth/AuthScreen';
import { getUserHousehold, getCurrentUser, signOut } from './src/services/authService';
import { Colors, FontSize, Spacing } from './src/core/theme';
import { I18nProvider, useI18n } from './src/core/i18n';

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

function AppContent() {
  const { t } = useI18n();
  const [user, setUser] = useState<{ id: string; email: string; display_name: string } | null>(null);
  const [hasHousehold, setHasHousehold] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const current = await getCurrentUser();
    setUser(current);
    if (current) {
      const household = await getUserHousehold().catch(() => null);
      setHasHousehold(!!household);
    } else {
      setHasHousehold(false);
    }
  }, []);

  useEffect(() => {
    checkAuth().finally(() => setLoading(false));
  }, [checkAuth]);

  const handleAuthSuccess = async () => {
    setLoading(true);
    await checkAuth();
    setLoading(false);
  };

  const handleSignOut = async () => {
    await signOut();
    await handleAuthSuccess();
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // A signed-in user should always have a household — cloud sign-up and
  // join both create/attach one atomically, and local sign-up seeds one
  // immediately. If this ever isn't the case (e.g. the account's household
  // was deleted server-side), there's no self-serve recovery screen for it;
  // sign the user out so they can create or join a household again via
  // AuthScreen instead of getting stuck on a dead-end screen.
  if (user && !hasHousehold) {
    return (
      <View style={styles.loading}>
        <Text style={styles.noHouseholdText}>{t('app.no_household')}</Text>
        <Text style={styles.noHouseholdLink} onPress={handleSignOut}>
          {t('app.sign_out_rejoin')}
        </Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      {!user ? (
        <AuthScreen onAuthSuccess={handleAuthSuccess} />
      ) : (
        <AppNavigator onSignOut={handleSignOut} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  noHouseholdText: {
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'center',
  },
  noHouseholdLink: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: '600',
  },
});