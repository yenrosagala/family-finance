import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View, StyleSheet } from 'react-native';
import { Colors } from '../core/theme';

import DashboardScreen from '../screens/dashboard/DashboardScreen';
import TransactionsScreen from '../screens/transactions/TransactionsScreen';
import AddTransactionScreen from '../screens/transactions/AddTransactionScreen';
import MoreScreen from '../screens/more/MoreScreen';
import ManageAccountsScreen from '../screens/more/ManageAccountsScreen';
import ManageCategoriesScreen from '../screens/more/ManageCategoriesScreen';
import HouseholdMembersScreen from '../screens/more/HouseholdMembersScreen';
import BudgetsScreen from '../screens/more/BudgetsScreen';
import SavingGoalsScreen from '../screens/more/SavingGoalsScreen';
import InvestmentsScreen from '../screens/more/InvestmentsScreen';
import NetWorthScreen from '../screens/more/NetWorthScreen';
import ScanScreen from '../screens/receipts/ScanScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

type IoniconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ routeName, focused }: { routeName: string; focused: boolean }) {
  const icons: Record<string, { active: IoniconName; inactive: IoniconName }> = {
    Dashboard: { active: 'home', inactive: 'home-outline' },
    Transactions: { active: 'receipt', inactive: 'receipt-outline' },
    Scan: { active: 'scan', inactive: 'scan-outline' },
    More: { active: 'ellipsis-horizontal-circle', inactive: 'ellipsis-horizontal' },
  };
  const set = icons[routeName] || { active: 'ellipsis-horizontal', inactive: 'ellipsis-horizontal' };
  return (
    <Ionicons
      name={focused ? set.active : set.inactive}
      size={24}
      color={focused ? Colors.primary : Colors.textMuted}
    />
  );
}

// Default bottom-tab pressable enhanced with stable, non-shifting press
// feedback. The Add tab renders a raised centerpiece FAB that floats above
// the bar (touch target stays >= 44pt via the full tab item hit area).
function TabBarButton({
  routeName,
  children,
  ...rest
}: {
  routeName: string;
  children?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean };
}) {
  if (routeName === 'Add') {
    return (
      <Pressable
        {...rest}
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        style={({ pressed }) => [
          styles.tabButton,
          styles.addTabButton,
          pressed && styles.tabButtonPressed,
        ]}
      >
        <View style={styles.addFab}>
          <Ionicons name="add" size={30} color="#FFFFFF" />
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      style={({ pressed }) => [styles.tabButton, pressed && styles.tabButtonPressed]}
    >
      {children}
    </Pressable>
  );
}

type MainTabsProps = {
  onSignOut?: () => void;
};

function MainTabs({ onSignOut }: MainTabsProps) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <TabIcon routeName={route.name} focused={focused} />,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarButton: (props: any) => <TabBarButton routeName={route.name} {...props} />,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Transactions" component={TransactionsScreen} />
      <Tab.Screen
        name="Add"
        component={AddTransactionScreen}
        options={{ tabBarLabel: '', tabBarIcon: () => null }}
      />
      <Tab.Screen name="Scan" component={ScanScreen} />
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
          options={({ route }: any) => ({
            headerShown: true,
            title: route?.params?.transactionId ? 'Edit Transaction' : 'Add Transaction',
          })}
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
        <Stack.Screen
          name="Household"
          component={HouseholdMembersScreen}
          options={{ headerShown: true, title: 'Household' }}
        />
        <Stack.Screen
          name="Budgets"
          component={BudgetsScreen}
          options={{ headerShown: true, title: 'Budgets' }}
        />
        <Stack.Screen
          name="SavingGoals"
          component={SavingGoalsScreen}
          options={{ headerShown: true, title: 'Saving Goals' }}
        />
        <Stack.Screen
          name="Investments"
          component={InvestmentsScreen}
          options={{ headerShown: true, title: 'Investments' }}
        />
        <Stack.Screen
          name="NetWorth"
          component={NetWorthScreen}
          options={{ headerShown: true, title: 'Net Worth' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  stackContent: { backgroundColor: Colors.background },
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonPressed: {
    opacity: 0.75,
  },
  addTabButton: {
    justifyContent: 'center',
  },
  // Raised centerpiece FAB: floats above the bar, stable press feedback that
  // never shifts layout, shadow for depth, 56pt (>= 44pt touch floor).
  addFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
    borderWidth: 4,
    borderColor: Colors.surface,
    shadowColor: Colors.primaryDark,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
