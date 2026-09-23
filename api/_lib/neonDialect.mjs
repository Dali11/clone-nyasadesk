// Minimal Kysely dialect over the Neon serverless HTTP driver (@neondatabase/serverless).
// Adapted from kysely-neon v2 (fetch-based, no WebSocket) so it runs on Vercel serverless
// and in restricted sandboxes. No external dependency beyond kysely + the neon driver.
import { PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';

export class NeonAdapter extends PostgresAdapter {
  get supportsTransactionalDdl() { return false; }
}

class NeonConnection {
  #neon;
  constructor(neon) { this.#neon = neon; }
  async executeQuery(compiledQuery) {
    const result = await this.#neon.query(
      compiledQuery.sql,
      [...compiledQuery.parameters],
      { arrayMode: false, fullResults: true },
    );
    const { command, rowCount, rows } = result;
    return {
      numAffectedRows: ['INSERT','UPDATE','DELETE','MERGE'].includes(command) ? BigInt(rowCount) : undefined,
      rows: rows ?? [],
    };
  }
  async streamQuery() { throw new Error('Neon dialect does not support streaming.'); }
}

export class NeonDriver {
  #config; #connection;
  constructor(config) { this.#config = config; }
  async acquireConnection() { return this.#connection; }
  async beginTransaction() { throw new Error('Neon dialect does not support interactive transactions.'); }
  async commitTransaction() {}
  async rollbackTransaction() {}
  async releaseConnection() {}
  async destroy() {}
  async init() {
    this.#connection ||= new NeonConnection(this.#config.neon);
  }
}

export class NeonDialect {
  #config;
  constructor(config) { this.#config = { ...config }; }
  createAdapter() { return new NeonAdapter(); }
  createDriver() { return new NeonDriver(this.#config); }
  createIntrospector(db) { return new PostgresIntrospector(db); }
  createQueryCompiler() { return new PostgresQueryCompiler(); }
}
