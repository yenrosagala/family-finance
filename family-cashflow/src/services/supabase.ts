import 'react-native-url-polyfill/auto';
import { createClient, Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ENV from '../constants/config';

const supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export default supabase;

export type { Session, User };
