import type { TaskJob } from '@nexus/shared';
import type { NexusDatabase } from './database.ts';

export class JobStore {
  readonly db: NexusDatabase;
  constructor(db: NexusDatabase) {
    this.db = db;
    db.sqlite.exec(`CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL, record TEXT NOT NULL); CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);`);
  }
  get(id: string): TaskJob | undefined {
    const row = this.db.sqlite.prepare('SELECT record FROM jobs WHERE id = ?').get(id) as { record: string } | undefined;
    return row ? JSON.parse(row.record) as TaskJob : undefined;
  }
  list(activeOnly = false): TaskJob[] {
    const rows = this.db.sqlite.prepare(activeOnly ? "SELECT record FROM jobs WHERE status IN ('pending','running') ORDER BY created_at" : 'SELECT record FROM jobs ORDER BY created_at DESC LIMIT 100').all() as { record: string }[];
    return rows.map(row => JSON.parse(row.record) as TaskJob);
  }
  add(value: TaskJob): void {
    this.db.sqlite.prepare('INSERT INTO jobs (id,status,created_at,record) VALUES (?,?,?,?)').run(value.id, value.status, value.createdAt, JSON.stringify(value));
  }
  patch(id: string, patch: Partial<TaskJob>, onlyActive = false): TaskJob | undefined {
    const current = this.get(id);
    if (!current || (onlyActive && !['pending', 'running'].includes(current.status))) return current;
    const next = { ...current, ...patch, id: current.id, updatedAt: new Date().toISOString() };
    this.db.sqlite.prepare('UPDATE jobs SET status = ?, record = ? WHERE id = ?').run(next.status, JSON.stringify(next), id);
    return next;
  }
  usesFile(id: string): boolean { return this.list(true).some(job => job.fileIds.includes(id)); }
}
