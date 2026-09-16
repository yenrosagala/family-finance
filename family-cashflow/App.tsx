import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import AuthScreen from './src/screens/auth/AuthScreen';
import HouseholdOnboardingScreen from './src/screens/auth/HouseholdOnboardingScreen';
import { getUserHousehold, getCurrentUser, signOut } from './src/services/authService';
import { Colors } from './src/core/theme';

export default function App() {
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

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      {!user ? (
        <AuthScreen onAuthSuccess={handleAuthSuccess} />
      ) : !hasHousehold ? (
        <HouseholdOnboardingScreen onComplete={handleAuthSuccess} />
      ) : (
        <AppNavigator onSignOut={async () => { await signOut(); await handleAuthSuccess(); }} />
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
  },
});