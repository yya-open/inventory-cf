#!/usr/bin/env python3
import sqlite3
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SCHEMA_FILES = [ROOT / 'sql' / 'schema.sql', ROOT / 'sql' / 'migrate_public_qr_throttle_and_pc_inventory.sql', ROOT / 'sql' / 'migrate_pc_warehouse.sql', ROOT / 'sql' / 'migrate_stocktake.sql', ROOT / 'sql' / 'migrate_query_perf_v2.sql', ROOT / 'sql' / 'migrate_ledger_hot_indexes.sql']
CHECKS = [
  {'name': 'stock_tx warehouse+type order', 'sql': "EXPLAIN QUERY PLAN SELECT id FROM stock_tx WHERE warehouse_id=1 AND type='OUT' ORDER BY created_at DESC LIMIT 20", 'must_include': ['idx_stock_tx_wh_type_created_at']},
  {'name': 'stocktake warehouse+status count', 'sql': "EXPLAIN QUERY PLAN SELECT COUNT(*) FROM stocktake WHERE warehouse_id=1 AND status='DRAFT'", 'must_include': ['idx_stocktake_wh_status_created_at']},
  {'name': 'pc asset status list', 'sql': "EXPLAIN QUERY PLAN SELECT id FROM pc_assets WHERE status='IN_STOCK' ORDER BY id ASC LIMIT 50", 'must_include': ['idx_pc_assets_status']},
  {'name': 'pc asset default ledger first page', 'sql': "EXPLAIN QUERY PLAN SELECT id FROM pc_assets WHERE archived=0 ORDER BY id ASC LIMIT 50", 'must_include': ['idx_pc_assets_archived_id']},
  {'name': 'monitor asset default ledger first page', 'sql': "EXPLAIN QUERY PLAN SELECT id FROM monitor_assets WHERE archived=0 ORDER BY id ASC LIMIT 50", 'must_include': ['idx_monitor_assets_archived_id']},
  {'name': 'monitor tx type+date', 'sql': "EXPLAIN QUERY PLAN SELECT id FROM monitor_tx WHERE tx_type='OUT' AND created_at>='2026-01-01 00:00:00' AND created_at<='2026-12-31 23:59:59'", 'must_include': ['idx_monitor_tx_type_created_at']},
  {'name': 'auth throttle lock lookup', 'sql': "EXPLAIN QUERY PLAN SELECT MAX(locked_until) FROM auth_login_throttle WHERE ip='1.1.1.1' AND (username='admin' OR username='*')", 'must_include': ['idx_auth_login_throttle_ip_username_locked']},
]

def exec_file(cur, path): cur.executescript(path.read_text(encoding='utf-8-sig'))
def seed(cur):
    cur.executescript("""
      INSERT OR IGNORE INTO warehouses (id, name) VALUES (1, '主仓'), (2, '电脑仓');
      INSERT OR IGNORE INTO items (id, sku, name, enabled) VALUES (1, 'SKU-1', '键盘', 1), (2, 'SKU-2', '鼠标', 1);
      INSERT OR IGNORE INTO stock (item_id, warehouse_id, qty) VALUES (1,1,10), (2,1,5);
      INSERT OR IGNORE INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, created_by) VALUES ('TX-1','OUT',1,1,1,-1,'admin'),('TX-2','OUT',2,1,2,-2,'admin'),('TX-3','IN',1,1,5,5,'admin');
      INSERT OR IGNORE INTO stocktake (id, st_no, warehouse_id, status, created_by) VALUES (1,'ST20260317-000001',1,'DRAFT','admin');
      INSERT OR IGNORE INTO pc_locations (id, name, parent_id, enabled) VALUES (1, 'A区', NULL, 1), (2, 'B区', NULL, 1);
      INSERT OR IGNORE INTO pc_assets (id, brand, serial_no, model, status) VALUES (1,'Dell','PC-1','7090','IN_STOCK'),(2,'HP','PC-2','800G9','ASSIGNED');
      INSERT OR IGNORE INTO monitor_assets (id, asset_code, status, location_id) VALUES (1,'MON-1','IN_STOCK',1),(2,'MON-2','ASSIGNED',2);
      INSERT OR IGNORE INTO monitor_tx (tx_no, tx_type, asset_id, asset_code, created_by) VALUES ('MON-TX-1','OUT',1,'MON-1','admin'),('MON-TX-2','OUT',2,'MON-2','admin');
      INSERT OR IGNORE INTO auth_login_throttle (ip, username, fail_count) VALUES ('1.1.1.1','admin',2);
    """)

def main():
    conn = sqlite3.connect(':memory:'); cur = conn.cursor()
    for path in SCHEMA_FILES: exec_file(cur, path)
    seed(cur)
    failures = []
    for check in CHECKS:
        rows = cur.execute(check['sql']).fetchall()
        detail = ' | '.join(str(r[-1]) for r in rows)
        print(f"[{check['name']}] {detail}")
        for token in check['must_include']:
            if token not in detail: failures.append(f"{check['name']} missing {token}")
    if failures:
        print('\n'.join(failures)); raise SystemExit(1)
if __name__ == '__main__': main()
