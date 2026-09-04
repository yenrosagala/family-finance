import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../core/theme';
import { createHousehold, joinHousehold, getUserHousehold } from '../../services/authService';

type HouseholdOnboardingScreenProps = {
  onComplete: () => void;
};

export default function HouseholdOnboardingScreen({ onComplete }: HouseholdOnboardingScreenProps) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkExistingHousehold();
  }, []);

  const checkExistingHousehold = async () => {
    const household = await getUserHousehold();
    if (household) {
      onComplete();
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (mode === 'create') {
        if (!name.trim()) {
          Alert.alert('Error', 'Please enter a household name');
          setLoading(false);
          return;
        }
        await createHousehold(name.trim());
      } else {
        if (!inviteCode.trim()) {
          Alert.alert('Error', 'Please enter an invite code');
          setLoading(false);
          return;
        }
        await joinHousehold(inviteCode.trim().toUpperCase());
      }
      onComplete();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Welcome!</Text>
      <Text style={styles.subtitle}>
        Create a household to track family finances together, or join one with an invite code.
      </Text>

      <View style={styles.modeSelector}>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'create' && styles.modeButtonActive]}
          onPress={() => setMode('create')}
        >
          <Text style={[styles.modeText, mode === 'create' && styles.modeTextActive]}>
            Create Household
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'join' && styles.modeButtonActive]}
          onPress={() => setMode('join')}
        >
          <Text style={[styles.modeText, mode === 'join' && styles.modeTextActive]}>
            Join Household
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'create' ? (
        <TextInput
          style={styles.input}
          placeholder="Household name (e.g. The Smiths)"
          placeholderTextColor={Colors.textMuted}
          value={name}
          onChangeText={setName}
        />
      ) : (
        <TextInput
          style={styles.input}
          placeholder="Invite code"
          placeholderTextColor={Colors.textMuted}
          value={inviteCode}
          onChangeText={setInviteCode}
          autoCapitalize="characters"
        />
      )}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Loading...' : mode === 'create' ? 'Create Household' : 'Join Household'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.lg,
    justifyContent: 'center',
    flexGrow: 1,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  modeSelector: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
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
  modeText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  modeTextActive: {
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
    marginBottom: Spacing.lg,
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
});
