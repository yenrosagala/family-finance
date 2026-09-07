export type LocalBindParams =
  | (string | number | null | Uint8Array)[]
  | Record<string, string | number | null | Uint8Array>;

export interface LocalRunResult {
  changes: number | bigint;
  lastInsertRowId: number | bigint;
}

export interface BalanceExecutor {
  runAsync(source: string, params?: LocalBindParams): Promise<LocalRunResult>;
}

export interface LocalExecutor extends BalanceExecutor {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T = unknown>(source: string, params?: LocalBindParams): Promise<T>;
  getAllAsync<T = unknown>(source: string, params?: LocalBindParams): Promise<T[]>;
}

export interface LocalDb extends LocalExecutor {
  withExclusiveTransactionAsync<T>(task: (txn: LocalExecutor) => Promise<T>): Promise<T>;
}