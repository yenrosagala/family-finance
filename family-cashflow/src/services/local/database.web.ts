import { LOCAL_MODE_UNAVAILABLE_MSG } from '../../core/dataSource';
import type { LocalDb } from './localDbTypes';

// Web stub: expo-sqlite is device-only. Metro resolves this file for the web
// bundle, keeping the real (native) implementation and its expo-sqlite import
// out of the web graph entirely.
export function getLocalDb(): Promise<LocalDb> {
  return Promise.reject(new Error(LOCAL_MODE_UNAVAILABLE_MSG));
}