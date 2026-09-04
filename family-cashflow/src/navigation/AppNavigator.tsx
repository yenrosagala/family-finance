import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../core/theme';

import DashboardScreen from '../screens/dashboard/DashboardScreen';
import TransactionsScreen from '../screens/transactions/TransactionsScreen';
import AddTransactionScreen from '../screens/transactions/AddTransactionScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Dashboard: '\uD83D\uDCCA',
    Transactions: '\uD83D\uDCCB',
    Add: '\u2795',
    Scan: '\uD83D\uDCF7',
    More: '\u22EF',
  };
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>
      {icons[label] || '\u2022'}
    </Text>
  );
}

function MoreScreen({ onSignOut }: { onSignOut?: () => void }) {
  return (
    <TouchableOpacity style={moreStyles.button} onPress={onSignOut}>
      <Text style={moreStyles.text}>Sign Out</Text>
    </TouchableOpacity>
  );
}

const moreStyles = StyleSheet.create({
  button: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  text: {
    fontSize: 16,
    color: Colors.expense,
    fontWeight: '600',
  },
});

type AppNavigatorProps = {
  onSignOut?: () => void;
};

export default function AppNavigator({ onSignOut }: AppNavigatorProps) {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main">
          {() => (
            <Tab.Navigator
              screenOptions={({ route }) => ({
                tabBarIcon: ({ focused }) => (
                  <TabIcon label={route.name} focused={focused} />
                ),
                tabBarActiveTintColor: Colors.primary,
                tabBarInactiveTintColor: Colors.textMuted,
                headerShown: false,
              })}
            >
              <Tab.Screen name="Dashboard" component={DashboardScreen} />
              <Tab.Screen name="Transactions" component={TransactionsScreen} />
              <Tab.Screen
                name="Add"
                component={AddTransactionScreen}
                options={{ tabBarLabel: 'Add' }}
              />
              <Tab.Screen
                name="Scan"
                component={DashboardScreen}
                options={{ tabBarLabel: 'Scan' }}
              />
              <Tab.Screen
                name="More"
                options={{ tabBarLabel: 'More' }}
              >
                {() => <MoreScreen onSignOut={onSignOut} />}
              </Tab.Screen>
            </Tab.Navigator>
          )}
        </Stack.Screen>
        <Stack.Screen
          name="AddTransaction"
          component={AddTransactionScreen}
          options={{ headerShown: true, title: 'Add Transaction' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
