import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, StyleSheet } from 'react-native';
import { Colors } from '../core/theme';

import DashboardScreen from '../screens/dashboard/DashboardScreen';
import TransactionsScreen from '../screens/transactions/TransactionsScreen';
import AddTransactionScreen from '../screens/transactions/AddTransactionScreen';
import MoreScreen from '../screens/more/MoreScreen';
import ManageAccountsScreen from '../screens/more/ManageAccountsScreen';
import ManageCategoriesScreen from '../screens/more/ManageCategoriesScreen';
import ScanScreen from '../screens/receipts/ScanScreen';

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

type MainTabsProps = {
  onSignOut?: () => void;
};

function MainTabs({ onSignOut }: MainTabsProps) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Transactions" component={TransactionsScreen} />
      <Tab.Screen name="Add" component={AddTransactionScreen} options={{ tabBarLabel: 'Add' }} />
      <Tab.Screen name="Scan" component={ScanScreen} options={{ tabBarLabel: 'Scan' }} />
      <Tab.Screen name="More">
        {({ navigation }) => <MoreScreen navigation={navigation} onSignOut={onSignOut} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

type AppNavigatorProps = {
  onSignOut?: () => void;
};

export default function AppNavigator({ onSignOut }: AppNavigatorProps) {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: styles.stackContent,
        }}
      >
        <Stack.Screen name="Main">
          {() => <MainTabs onSignOut={onSignOut} />}
        </Stack.Screen>
        <Stack.Screen
          name="AddTransaction"
          component={AddTransactionScreen}
          options={{ headerShown: true, title: 'Add Transaction' }}
        />
        <Stack.Screen
          name="Accounts"
          component={ManageAccountsScreen}
          options={{ headerShown: true, title: 'Accounts' }}
        />
        <Stack.Screen
          name="Categories"
          component={ManageCategoriesScreen}
          options={{ headerShown: true, title: 'Categories' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  stackContent: { backgroundColor: Colors.background },
});
