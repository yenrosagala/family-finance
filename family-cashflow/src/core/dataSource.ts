import AsyncStorage from '@react-native-async-storage/async-storage';

// Data source selection for each household/account:
//   'cloud' — the shared Supabase-backed Express API (default)
//   'local' — an on-device SQLite database (Android/iOS only)
// The choice is persisted per device and made at sign-up/sign-in time.

export type DataSource = 'cloud' | 'local';

const DATA_SOURCE_KEY = 'fcf_data_source';

export const LOCAL_MODE_UNAVAILABLE_MSG =
  'Local database mode is only available on the Android/iOS app. Please use Cloud on this device.';

export async function getDataSource(): Promise<DataSource> {
  const value = await AsyncStorage.getItem(DATA_SOURCE_KEY);
  return value === 'local' ? 'local' : 'cloud';
}

export async function isLocalMode(): Promise<boolean> {
  return (await getDataSource()) === 'local';
}

export async function setDataSource(mode: DataSource): Promise<void> {
  await AsyncStorage.setItem(DATA_SOURCE_KEY, mode);
}

export function localUnavailable(feature: string): Error {
  return new Error(`${feature} is not available in Local mode yet. Switch to Cloud to use it.`);
}