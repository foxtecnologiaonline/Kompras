import type { SQLiteDatabase } from 'expo-sqlite';

export const DB_NAME = 'kompras.db';

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  // Foreign key enforcement is per connection (and a no-op inside a
  // transaction), so it has to be set here, before anything else touches the
  // database. Writes that must honor it therefore use db.withTransactionAsync
  // (same connection) — never withExclusiveTransactionAsync, which opens a new
  // connection that doesn't inherit this setting.
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version < 1) {
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
    version = 1;
  }

  if (version < 2) {
    await db.execAsync(
      'ALTER TABLE shopping_list_item ADD COLUMN quantity REAL NOT NULL DEFAULT 1;'
    );
    version = 2;
  }

  if (version < 3) {
    await db.execAsync('ALTER TABLE purchase ADD COLUMN receipt_photo_uri TEXT;');
    version = 3;
  }

  if (version < 4) {
    await db.execAsync('ALTER TABLE shopping_list ADD COLUMN name TEXT;');
    version = 4;
  }

  if (version < 5) {
    // Set when the list's purchase is closed (coupon scanned/typed), so the
    // same list can't be closed twice and end up duplicated in the history.
    await db.execAsync('ALTER TABLE shopping_list ADD COLUMN closed_at TEXT;');
    version = 5;
  }

  await db.execAsync(`PRAGMA user_version = ${version};`);
}
