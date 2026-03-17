export type FakeUser = {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'operator' | 'viewer';
  is_active: number;
  must_change_password: number;
  token_version: number;
};

export type FakePcAsset = {
  id: number;
  qr_key?: string | null;
  brand?: string | null;
  model?: string | null;
  serial_no?: string | null;
  manufacture_date?: string | null;
  warranty_end?: string | null;
  disk_capacity?: string | null;
  memory_size?: string | null;
  status?: string | null;
  remark?: string | null;
  last_employee_no?: string | null;
  last_employee_name?: string | null;
  last_department?: string | null;
  last_config_date?: string | null;
  last_recycle_date?: string | null;
};

export type FakeState = {
  users: FakeUser[];
  authLoginThrottle: Map<string, { fail_count: number; last_fail_at: string | null; locked_until: string | null }>;
  publicApiThrottle: Map<string, { count: number; updated_at: string }>;
  pcAssets: FakePcAsset[];
  pcInventoryLog: any[];
  stocktakes: Array<{ id: number; st_no: string; warehouse_id: number; status: string; created_by: string; created_at: string; applied_at: string | null }>;
  stocktakeLines: Array<{ id: number; stocktake_id: number; item_id: number; system_qty: number; counted_qty: number | null; diff_qty: number | null; updated_at: string }>;
  items: Array<{ id: number; sku: string; name: string; enabled: number }>;
  warehouses: Array<{ id: number; name: string }>;
  stock: Map<string, { item_id: number; warehouse_id: number; qty: number; updated_at: string }>;
  stockTx: Array<{ id: number; tx_no: string; type: string; item_id: number; warehouse_id: number; qty: number; delta_qty: number; ref_type: string | null; ref_id: number | null; ref_no: string | null; remark: string | null; created_by: string | null }>;
};

function nowText() {
  return '2026-03-17 08:00:00';
}

function norm(sql: string) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function ok(meta: Record<string, any> = {}) {
  return { success: true, meta: { changes: 0, last_row_id: 0, ...meta } };
}

class FakePrepared {
  private args: any[] = [];
  constructor(private db: FakeD1Database, private sql: string) {}
  bind(...args: any[]) {
    this.args = args;
    return this;
  }
  async first<T>() {
    return this.db.exec(this.sql, this.args, 'first') as Promise<T | null>;
  }
  async all<T>() {
    const results = (await this.db.exec(this.sql, this.args, 'all')) as T[];
    return { results } as any;
  }
  async run() {
    return this.db.exec(this.sql, this.args, 'run') as Promise<any>;
  }
}

export class FakeD1Database {
  state: FakeState = {
    users: [],
    authLoginThrottle: new Map(),
    publicApiThrottle: new Map(),
    pcAssets: [],
    pcInventoryLog: [],
    stocktakes: [],
    stocktakeLines: [],
    items: [],
    warehouses: [{ id: 1, name: '主仓' }, { id: 2, name: '电脑仓' }],
    stock: new Map(),
    stockTx: [],
  };

  private ids = { stocktake: 1, stocktakeLine: 1, stockTx: 1, pcInventoryLog: 1 };
  private lastBatchUpdateChanges = 0;

  prepare(sql: string) {
    return new FakePrepared(this, sql) as any;
  }

  async batch(statements: any[]) {
    const results: any[] = [];
    for (const stmt of statements) results.push(await stmt.run());
    return results;
  }

  seedStock(item_id: number, warehouse_id: number, qty: number) {
    this.state.stock.set(`${item_id}|${warehouse_id}`, { item_id, warehouse_id, qty, updated_at: nowText() });
  }

  private getStock(itemId: number, warehouseId: number) {
    return this.state.stock.get(`${itemId}|${warehouseId}`) || null;
  }

  async exec(sql: string, args: any[], mode: 'first' | 'all' | 'run') {
    const q = norm(sql);

    if (q.startsWith('select id, username, password_hash, role, is_active, must_change_password, token_version from users where username=?')) {
      const row = this.state.users.find((u) => u.username === String(args[0])) || null;
      return mode === 'first' ? row : row ? [row] : [];
    }
    if (q.startsWith('select id, username, role, is_active, must_change_password, token_version from users where id=?')) {
      const row = this.state.users.find((u) => u.id === Number(args[0])) || null;
      if (!row) return mode === 'first' ? null : [];
      const { password_hash: _password_hash, ...rest } = row;
      return mode === 'first' ? rest : [rest];
    }
    if (q.startsWith('select password_hash from users where id=?')) {
      const row = this.state.users.find((u) => u.id === Number(args[0])) || null;
      return row ? { password_hash: row.password_hash } : null;
    }
    if (q.startsWith('select token_version, username, role from users where id=?')) {
      const row = this.state.users.find((u) => u.id === Number(args[0])) || null;
      return row ? { token_version: row.token_version, username: row.username, role: row.role } : null;
    }
    if (q.startsWith('update users set password_hash=?, must_change_password=0, token_version=token_version+1 where id=?')) {
      const row = this.state.users.find((u) => u.id === Number(args[1]));
      if (!row) return ok();
      row.password_hash = String(args[0]);
      row.must_change_password = 0;
      row.token_version += 1;
      return ok({ changes: 1, last_row_id: row.id });
    }
    if (q.startsWith('select fail_count, last_fail_at from auth_login_throttle where ip=? and username=?')) {
      return this.state.authLoginThrottle.get(`${args[0]}|${args[1]}`) || null;
    }
    if (q.startsWith('select max(locked_until) as locked_until from auth_login_throttle where ip=?')) {
      const keys = [`${args[0]}|${args[1]}`, `${args[0]}|*`];
      let locked: string | null = null;
      for (const key of keys) {
        const row = this.state.authLoginThrottle.get(key);
        if (row?.locked_until) locked = row.locked_until;
      }
      return { locked_until: locked };
    }
    if (q.startsWith('insert into auth_login_throttle ')) {
      const key = `${args[0]}|${args[1]}`;
      const row = this.state.authLoginThrottle.get(key) || { fail_count: 0, last_fail_at: null, locked_until: null };
      row.fail_count += 1;
      row.last_fail_at = nowText();
      this.state.authLoginThrottle.set(key, row);
      return ok({ changes: 1 });
    }
    if (q.startsWith('delete from auth_login_throttle where ip=? and (username=? or username=')) {
      this.state.authLoginThrottle.delete(`${args[0]}|${args[1]}`);
      this.state.authLoginThrottle.delete(`${args[0]}|*`);
      return ok({ changes: 1 });
    }

    if (q.startsWith('create table if not exists public_api_throttle')) return ok();
    if (q.startsWith('delete from public_api_throttle where updated_at <')) return ok();
    if (q.startsWith('insert into public_api_throttle (k, count) values (?, 1) on conflict(k) do update set count = count + 1')) {
      const key = String(args[0]);
      const row = this.state.publicApiThrottle.get(key) || { count: 0, updated_at: nowText() };
      row.count += 1;
      row.updated_at = nowText();
      this.state.publicApiThrottle.set(key, row);
      return ok({ changes: 1 });
    }
    if (q.startsWith('select count from public_api_throttle where k=?')) {
      const row = this.state.publicApiThrottle.get(String(args[0]));
      return row ? { count: row.count } : null;
    }
    if (q.startsWith('select id, qr_key from pc_assets where id=?')) {
      const row = this.state.pcAssets.find((asset) => asset.id === Number(args[0])) || null;
      return row ? { id: row.id, qr_key: row.qr_key || null } : null;
    }
    if (q.includes('with latest_out as (') && q.includes('from pc_assets a') && q.includes('where a.id=?')) {
      return this.state.pcAssets.find((asset) => asset.id === Number(args[2])) || null;
    }
    if (q.startsWith('insert into pc_inventory_log (asset_id, action, issue_type, remark, ip, ua, created_at) values (?, ?, ?, ?, ?, ?, ')) {
      this.state.pcInventoryLog.push({ id: this.ids.pcInventoryLog++, asset_id: Number(args[0]), action: String(args[1]), issue_type: args[2] ?? null, remark: args[3] ?? null, ip: String(args[4] || ''), ua: String(args[5] || '') });
      return ok({ changes: 1 });
    }

    if (q.startsWith('select s.*, w.name as warehouse_name from stocktake s left join warehouses w on w.id=s.warehouse_id where s.id=?')) {
      const row = this.state.stocktakes.find((s) => s.id === Number(args[0])) || null;
      if (!row) return null;
      const warehouse = this.state.warehouses.find((w) => w.id === row.warehouse_id);
      return { ...row, warehouse_name: warehouse?.name || null };
    }
    if (q.startsWith('insert into stocktake (st_no, warehouse_id, status, created_by, created_at) values (?, ?, ')) {
      const id = this.ids.stocktake++;
      this.state.stocktakes.push({ id, st_no: String(args[0]), warehouse_id: Number(args[1]), status: 'DRAFT', created_by: String(args[2]), created_at: nowText(), applied_at: null });
      return ok({ changes: 1, last_row_id: id });
    }
    if (q.startsWith('insert into stocktake_line (stocktake_id, item_id, system_qty, counted_qty, diff_qty, updated_at) select (select id from stocktake where st_no=?), i.id,')) {
      const stNo = String(args[0]);
      const warehouseId = Number(args[1]);
      const stocktake = this.state.stocktakes.find((s) => s.st_no === stNo);
      if (!stocktake) return ok();
      const enabled = this.state.items.filter((item) => Number(item.enabled) === 1);
      for (const item of enabled) {
        const stock = this.getStock(item.id, warehouseId);
        this.state.stocktakeLines.push({ id: this.ids.stocktakeLine++, stocktake_id: stocktake.id, item_id: item.id, system_qty: Number(stock?.qty || 0), counted_qty: null, diff_qty: null, updated_at: nowText() });
      }
      return ok({ changes: enabled.length });
    }
    if (q.startsWith('select id from stocktake where st_no=?')) {
      const row = this.state.stocktakes.find((s) => s.st_no === String(args[0])) || null;
      return row ? { id: row.id } : null;
    }
    if (q.startsWith('update stocktake set status=')) {
      const row = this.state.stocktakes.find((s) => s.id === Number(args[0]));
      if (!row) return ok();
      if (q.includes("status='applying'") && row.status === 'DRAFT') { row.status = 'APPLYING'; return ok({ changes: 1 }); }
      if (q.includes("status='applied'") && row.status === 'APPLYING') { row.status = 'APPLIED'; row.applied_at = nowText(); return ok({ changes: 1 }); }
      if (q.includes("status='rolling'") && row.status === 'APPLIED') { row.status = 'ROLLING'; return ok({ changes: 1 }); }
      if (q.includes("status='draft', applied_at=null") && row.status === 'ROLLING') { row.status = 'DRAFT'; row.applied_at = null; return ok({ changes: 1 }); }
      return ok({ changes: 0 });
    }
    if (q.startsWith('select status from stocktake where id=?')) {
      const row = this.state.stocktakes.find((s) => s.id === Number(args[0])) || null;
      return row ? { status: row.status } : null;
    }
    if (q.startsWith('select * from stocktake_line where stocktake_id=? and counted_qty is not null')) {
      return this.state.stocktakeLines.filter((line) => line.stocktake_id === Number(args[0]) && line.counted_qty != null);
    }
    if (q.startsWith('insert or ignore into stock (item_id, warehouse_id, qty, updated_at) values (?, ?, 0,')) {
      const itemId = Number(args[0]);
      const warehouseId = Number(args[1]);
      if (!this.getStock(itemId, warehouseId)) { this.seedStock(itemId, warehouseId, 0); return ok({ changes: 1 }); }
      return ok({ changes: 0 });
    }
    if (q.startsWith('update stock set qty = qty + ?, updated_at=')) {
      const diff = Number(args[0]);
      const itemId = Number(args[1]);
      const warehouseId = Number(args[2]);
      const refId = Number(args[4]);
      const exists = this.state.stockTx.some((tx) => tx.ref_type === 'STOCKTAKE' && tx.ref_id === refId && tx.item_id === itemId && tx.warehouse_id === warehouseId);
      const row = this.getStock(itemId, warehouseId);
      if (!row || exists || row.qty + diff < 0) { this.lastBatchUpdateChanges = 0; return ok({ changes: 0 }); }
      row.qty += diff;
      this.lastBatchUpdateChanges = 1;
      return ok({ changes: 1 });
    }
    if (q.startsWith('insert into stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, ref_type, ref_id, ref_no, remark, created_by) select ?, ')) {
      const isRollback = q.includes("'reversal'");
      if (!isRollback && this.lastBatchUpdateChanges <= 0) return ok({ changes: 0 });
      if (isRollback) {
        const exists = this.state.stockTx.some((tx) => tx.ref_type === 'STOCKTAKE_ROLLBACK' && tx.ref_id === Number(args[9]) && tx.item_id === Number(args[10]) && tx.warehouse_id === Number(args[11]));
        if (exists) return ok({ changes: 0 });
      }
      this.state.stockTx.push({ id: this.ids.stockTx++, tx_no: String(args[0]), type: isRollback ? 'REVERSAL' : 'ADJUST', item_id: Number(args[1]), warehouse_id: Number(args[2]), qty: Number(args[3]), delta_qty: Number(args[4]), ref_type: isRollback ? 'STOCKTAKE_ROLLBACK' : 'STOCKTAKE', ref_id: Number(args[5]), ref_no: String(args[6]), remark: String(args[7]), created_by: String(args[8]) });
      return ok({ changes: 1 });
    }
    if (q.startsWith('select l.*, i.sku from stocktake_line l join items i on i.id=l.item_id where l.stocktake_id=? and l.diff_qty is not null and l.diff_qty != 0')) {
      return this.state.stocktakeLines.filter((line) => line.stocktake_id === Number(args[0]) && Number(line.diff_qty || 0) !== 0).map((line) => ({ ...line, sku: this.state.items.find((item) => item.id === line.item_id)?.sku || null }));
    }
    if (q.startsWith('insert into stock (item_id, warehouse_id, qty, updated_at) values (?, ?, ?, ') && q.includes('on conflict(item_id, warehouse_id) do update set qty=excluded.qty')) {
      this.seedStock(Number(args[0]), Number(args[1]), Number(args[2]));
      return ok({ changes: 1 });
    }
    if (q.startsWith('select count(1) as c from stocktake_line where stocktake_id=?')) {
      return { c: this.state.stocktakeLines.filter((line) => line.stocktake_id === Number(args[0])).length };
    }

    throw new Error(`Unhandled fake SQL (${mode}): ${sql}`);
  }
}

export function createFakeEnv(secret = 'test-secret') {
  const DB = new FakeD1Database();
  return { env: { DB, JWT_SECRET: secret } as any, DB };
}
