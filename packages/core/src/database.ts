import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { desc, eq } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { StoredFile } from '@nexus/shared';
const files = sqliteTable('files', {
  id: text('id').primaryKey(), name: text('name').notNull(), mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(), createdAt: text('created_at').notNull(), tool: text('tool').notNull(),
});
export function openDatabase(dataDir: string) {
  mkdirSync(join(dataDir, 'db'), { recursive: true });
  const sqlite = new Database(join(dataDir, 'db', 'nexus.sqlite'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes >= 0), created_at TEXT NOT NULL, tool TEXT NOT NULL); CREATE INDEX IF NOT EXISTS files_created ON files(created_at);`);
  const db = drizzle(sqlite);
  return {
    sqlite,
    addFile(value: StoredFile) { db.insert(files).values(value).run(); return value; },
    file(id: string) { return db.select().from(files).where(eq(files.id, id)).get(); },
    files() { return db.select().from(files).orderBy(desc(files.createdAt)).limit(100).all(); },
    removeFile(id: string) { db.delete(files).where(eq(files.id, id)).run(); },
    close() { sqlite.close(); },
  };
}
export type NexusDatabase = ReturnType<typeof openDatabase>;
