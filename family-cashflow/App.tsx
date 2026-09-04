import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import AuthScreen from './src/screens/auth/AuthScreen';
import HouseholdOnboardingScreen from './src/screens/auth/HouseholdOnboardingScreen';
import supabase from './src/services/supabase';
import { getUserHousehold } from './src/services/authService';
import { Colors } from './src/core/theme';
import { Session } from '@supabase/supabase-js';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [hasHousehold, setHasHousehold] = useState(false);
  const [checkingHousehold, setCheckingHousehold] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        setHasHousehold(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && !checkingHousehold) {
      setCheckingHousehold(true);
      getUserHousehold()
        .then((household) => setHasHousehold(!!household))
        .finally(() => setCheckingHousehold(false));
    }
  }, [session]);

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
      {!session ? (
        <AuthScreen onAuthSuccess={() => {}} />
      ) : !hasHousehold ? (
        <HouseholdOnboardingScreen onComplete={() => getUserHousehold().then((h) => setHasHousehold(!!h))} />
      ) : (
        <AppNavigator />
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
