import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Minimal stand-in for expo-sqlite's SQLiteDatabase, backed by Node's built-in
 * SQLite, so the real migration and repository code can run under Node.
 * It only implements the methods the app uses. Needs Node >= 22.13.
 */
export function createTestDb(): { db: SQLiteDatabase; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  const shim = {
    execAsync: async (sql: string) => {
      raw.exec(sql);
    },
    runAsync: async (sql: string, ...params: any[]) => {
      const r = raw.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getFirstAsync: async (sql: string, ...params: any[]) =>
      (raw.prepare(sql).get(...params) as any) ?? null,
    getAllAsync: async (sql: string, ...params: any[]) => raw.prepare(sql).all(...params),
    withTransactionAsync: async (task: () => Promise<void>) => {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
  };
  // Real expo-sqlite runs this on a *separate* connection (no foreign_keys,
  // other writers can hit "database is locked"). The shim reuses the single
  // connection, so it only proves the SQL/ordering, not that concurrency behaviour.
  (shim as any).withExclusiveTransactionAsync = async (task: (txn: typeof shim) => Promise<void>) =>
    shim.withTransactionAsync(() => task(shim));
  return { db: shim as unknown as SQLiteDatabase, raw };
}
