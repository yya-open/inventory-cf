import { apiFetchFile, apiGet, triggerFileDownload } from '../api/client';
import type { InventoryBatchKind } from '../api/inventoryBatches';

type InventoryLogExportConfig = {
  label: string;
  countPath: string;
  exportPath: string;
};

const EXPORT_LIMIT = 100000;

const CONFIG: Record<InventoryBatchKind, InventoryLogExportConfig> = {
  pc: {
    label: '电脑',
    countPath: '/api/pc-inventory-log-count',
    exportPath: '/api/pc-inventory-log/export',
  },
  monitor: {
    label: '显示器',
    countPath: '/api/monitor-inventory-log-count',
    exportPath: '/api/monitor-inventory-log/export',
  },
};

function buildTimestamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}_${hh}${mm}${ss}`;
}

export async function exportInventoryLogsBeforeBatch(kind: InventoryBatchKind) {
  const cfg = CONFIG[kind];
  const countResult: any = await apiGet(cfg.countPath);
  const total = Number(countResult?.total || 0);
  if (!Number.isFinite(total) || total <= 0) {
    return { exported: false, total: 0, filename: '' };
  }
  if (total > EXPORT_LIMIT) {
    throw new Error(`${cfg.label}盘点记录共有 ${total} 条，超过自动导出上限 ${EXPORT_LIMIT} 条，请先手工导出后再开启新一轮盘点。`);
  }

  const filename = `${cfg.label}盘点记录_${buildTimestamp()}_开启新一轮前备份.csv`;
  const file = await apiFetchFile(`${cfg.exportPath}?max=${EXPORT_LIMIT}`, filename);
  triggerFileDownload(file, filename);
  return { exported: true, total, filename };
}
