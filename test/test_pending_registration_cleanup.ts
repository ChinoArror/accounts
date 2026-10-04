import Database from 'better-sqlite3';
import { cleanupExpiredPendingRegistrations } from '../src/emailAuthFeature';

class D1Statement {
  private values: unknown[] = [];

  constructor(private readonly statement: Database.Statement) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  first() {
    return this.statement.get(...this.values) || null;
  }

  all() {
    return { results: this.statement.all(...this.values) };
  }

  run() {
    const result = this.statement.run(...this.values);
    return { meta: { changes: result.changes } };
  }
}

const sqlite = new Database(':memory:');
sqlite.exec(`
  CREATE TABLE users (
    uuid TEXT PRIMARY KEY,
    status TEXT,
    email_verified INTEGER,
    created_at TEXT,
    avatar_key TEXT,
    avatar_original_key TEXT,
    avatar_pending_delete_key TEXT,
    avatar_original_pending_delete_key TEXT
  );
  CREATE TABLE register_codes (
    id TEXT,
    code TEXT,
    used_count INTEGER,
    max_uses INTEGER,
    status TEXT,
    used_by_uuid TEXT,
    used_by_username TEXT,
    used_at TEXT
  );
  CREATE TABLE register_code_uses (id TEXT, code_id TEXT, user_id TEXT);
  CREATE TABLE auth_tokens (user_id TEXT);
  CREATE TABLE auth_sessions (user_id TEXT);
  CREATE TABLE user_sessions (uuid TEXT);
  CREATE TABLE user_credentials (user_id TEXT);
  CREATE TABLE user_apps (uuid TEXT);
  CREATE TABLE passkeys (uuid TEXT);
`);

const db = {
  prepare(sql: string) {
    return new D1Statement(sqlite.prepare(sql));
  },
  batch(statements: D1Statement[]) {
    return sqlite.transaction(() => statements.map((statement) => statement.run()))();
  },
};

sqlite.prepare("INSERT INTO users (uuid, status, email_verified, created_at) VALUES ('expired', 'pending', 0, datetime('now', '-25 hours'))").run();
sqlite.prepare("INSERT INTO users (uuid, status, email_verified, created_at) VALUES ('active', 'active', 1, datetime('now', '-25 hours'))").run();
sqlite.prepare("INSERT INTO register_codes VALUES ('code-id', 'plain-code', 1, 1, 'used', 'expired', 'expired-name', CURRENT_TIMESTAMP)").run();
sqlite.prepare("INSERT INTO register_code_uses VALUES ('use-id', 'code-id', 'expired')").run();

const deleted = await cleanupExpiredPendingRegistrations({ DB: db });
const code = sqlite.prepare("SELECT used_count, status, used_by_uuid FROM register_codes WHERE id = 'code-id'").get() as any;

if (deleted !== 1) throw new Error(`Expected one deletion, got ${deleted}`);
if (sqlite.prepare("SELECT 1 FROM users WHERE uuid = 'expired'").get()) throw new Error('Expired user was not deleted');
if (!sqlite.prepare("SELECT 1 FROM users WHERE uuid = 'active'").get()) throw new Error('Active user was deleted');
if (code.used_count !== 0 || code.status !== 'unused' || code.used_by_uuid !== null) {
  throw new Error(`Register code was not released: ${JSON.stringify(code)}`);
}

console.log('pending registration cleanup: ok');
