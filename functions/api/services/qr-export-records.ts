import { ensureMonitorQrColumns } from '../_monitor';
import { ensurePcQrColumns } from '../_pc';
import { getOrCreateAssetQrBulk, type AssetQrConfig } from './asset-qr';
import type { QrPrintContentMode, QrPrintTemplate } from './qr-print-template';

export type QrCardRecord = {
  title: string;
  subtitle?: string;
  meta?: Array<{ label: string; value: string }>;
  url: string;
};

type AssetQrRecordConfig<Row = any> = {
  ensureColumns: (db: D1Database) => Promise<void>;
  listByIds: (db: D1Database, ids: number[]) => Promise<Row[]>;
  qrConfig: AssetQrConfig;
  mapRecord: (row: Row) => Omit<QrCardRecord, 'url'>;
};

async function listRowsByIds(db: D1Database, sql: string, ids: number[]) {
  if (!ids.length) return [] as any[];
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.prepare(sql.replace('__IDS__', placeholders)).bind(...ids).all<any>();
  return result.results || [];
}

async function listPcAssetsByIds(db: D1Database, ids: number[]) {
  return listRowsByIds(
    db,
    `SELECT a.*, s.current_employee_no AS last_employee_no, s.current_employee_name AS last_employee_name, s.current_department AS last_department
       FROM pc_assets a
       LEFT JOIN pc_asset_latest_state s ON s.asset_id=a.id
      WHERE a.id IN (__IDS__)
      ORDER BY a.id ASC`,
    ids,
  );
}

async function listMonitorAssetsByIds(db: D1Database, ids: number[]) {
  return listRowsByIds(
    db,
    `SELECT a.*, l.name AS location_name, p.name AS parent_location_name
       FROM monitor_assets a
       LEFT JOIN pc_locations l ON l.id=a.location_id
       LEFT JOIN pc_locations p ON p.id=l.parent_id
      WHERE a.id IN (__IDS__)
      ORDER BY a.id ASC`,
    ids,
  );
}

async function buildAssetQrRecords<Row>(db: D1Database, origin: string, ids: number[], config: AssetQrRecordConfig<Row>) {
  await config.ensureColumns(db);
  const rows = await config.listByIds(db, ids);
  const links = await getOrCreateAssetQrBulk(db, config.qrConfig, ids, origin);
  const rowMap = new Map<number, Row>();
  for (const row of rows as any[]) rowMap.set(Number(row.id), row);
  const linkMap = new Map<number, string>(links.map((item) => [Number(item.id), String(item.url || '')] as [number, string]));
  return ids
    .map((id) => rowMap.get(Number(id)) as any)
    .filter(Boolean)
    .map((row: any) => ({
      ...config.mapRecord(row),
      url: linkMap.get(Number(row.id)) || '',
    }))
    .filter((item) => item.url);
}

function normalizeContentMode(input?: Partial<QrPrintTemplate> | null): QrPrintContentMode {
  const mode = String(input?.content_mode || 'detail');
  return mode === 'qr_only' || mode === 'model_sn' || mode === 'model_asset' ? mode : 'detail';
}

export async function buildPcQrRecords(db: D1Database, origin: string, ids: number[], template?: Partial<QrPrintTemplate> | null) {
  const mode = normalizeContentMode(template);
  return buildAssetQrRecords(db, origin, ids, {
    ensureColumns: ensurePcQrColumns,
    listByIds: listPcAssetsByIds,
    qrConfig: {
      assetTable: 'pc_assets',
      notFoundMessage: '电脑台账不存在或已删除',
      publicPath: '/public/pc-asset',
    },
    mapRecord: (row: any) => {
      const modelText = [row.brand, row.model].filter(Boolean).join(' ') || `电脑 #${row.id}`;
      const serialNo = row.serial_no || '-';
      if (mode === 'qr_only') return { title: '', subtitle: '', meta: [] };
      if (mode === 'model_sn') return { title: modelText, subtitle: `SN：${serialNo}`, meta: [] };
      if (mode === 'model_asset') return { title: modelText, subtitle: `编号：${row.id || '-'}`, meta: [] };
      return {
        title: [row.brand, row.model].filter(Boolean).join(' · ') || `电脑 #${row.id}`,
        subtitle: `SN：${serialNo} · 状态：${row.status || '-'}`,
        meta: [
          { label: '领用人', value: row.last_employee_name || '-' },
          { label: '工号', value: row.last_employee_no || '-' },
          { label: '部门', value: row.last_department || '-' },
          { label: '归档', value: Number(row.archived || 0) === 1 ? '已归档' : '在用' },
        ],
      };
    },
  });
}

export async function buildMonitorQrRecords(db: D1Database, origin: string, ids: number[], template?: Partial<QrPrintTemplate> | null) {
  const mode = normalizeContentMode(template);
  return buildAssetQrRecords(db, origin, ids, {
    ensureColumns: ensureMonitorQrColumns,
    listByIds: listMonitorAssetsByIds,
    qrConfig: {
      assetTable: 'monitor_assets',
      notFoundMessage: '显示器台账不存在或已删除',
      publicPath: '/public/monitor-asset',
    },
    mapRecord: (row: any) => {
      const modelText = [row.brand, row.model].filter(Boolean).join(' ') || `显示器 #${row.id}`;
      const assetCode = row.asset_code || '-';
      const sn = row.sn || '-';
      if (mode === 'qr_only') return { title: '', subtitle: '', meta: [] };
      if (mode === 'model_sn') return { title: modelText, subtitle: `SN：${sn}`, meta: [] };
      if (mode === 'model_asset') return { title: modelText, subtitle: `资产编号：${assetCode}`, meta: [] };
      return {
        title: row.asset_code || `显示器 #${row.id}`,
        subtitle: [row.brand, row.model].filter(Boolean).join(' · ') || `SN：${sn}`,
        meta: [
          { label: '状态', value: row.status || '-' },
          { label: '位置', value: [row.parent_location_name, row.location_name].filter(Boolean).join('/') || '-' },
          { label: '领用人', value: row.employee_name || '-' },
          { label: '归档', value: Number(row.archived || 0) === 1 ? '已归档' : '在用' },
        ],
      };
    },
  });
}
