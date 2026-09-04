import Constants from 'expo-constants';

const ENV = {
  supabaseUrl: Constants.expoConfig?.extra?.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: Constants.expoConfig?.extra?.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export default ENV;
