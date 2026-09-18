import type { SQLiteDatabase } from 'expo-sqlite';

export const DB_NAME = 'kompras.db';

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS shopping_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shopping_list_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (list_id) REFERENCES shopping_list(id)
    );

    CREATE TABLE IF NOT EXISTS purchase (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER,
      purchase_date TEXT NOT NULL,
      total_value REAL NOT NULL,
      raw_source TEXT NOT NULL,
      FOREIGN KEY (list_id) REFERENCES shopping_list(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      unit_value REAL NOT NULL,
      quantity REAL NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES purchase(id)
    );
  `);
}
