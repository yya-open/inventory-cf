import { formatBeijingDateTime } from './datetime';

export const ACTION_LABEL: Record<string, string> = {
  STOCK_IN: "入库",
  STOCK_OUT: "出库",
  BATCH_IN: "批量入库",
  BATCH_OUT: "批量出库",
  TX_EXPORT: "导出出入库流水",
  TX_CLEAR: "清空出入库明细",

  STOCKTAKE_CREATE: "创建盘点单",
  STOCKTAKE_IMPORT: "导入盘点结果",
  STOCKTAKE_APPLY: "应用盘点",
  STOCKTAKE_ROLLBACK: "回滚盘点",
  STOCKTAKE_DELETE: "删除盘点单",

  ITEM_CREATE: "新增配件",
  ITEM_UPDATE: "修改配件",
  ITEM_DELETE: "删除配件",

  USER_CREATE: "新增用户",
  USER_UPDATE: "修改用户",
  USER_DELETE: "删除用户",
  USER_RESET_PASSWORD: "重置用户密码",

  AUDIT_DELETE: "删除审计日志",

  ADMIN_INIT_SCHEMA: "初始化系统结构",
  ADMIN_BACKUP: "导出备份",
  ADMIN_RESTORE: "恢复备份",
  ADMIN_RESTORE_UPLOAD: "直传恢复备份",
  ADMIN_RESTORE_JOB_CREATE: "创建恢复任务",
  ADMIN_RESTORE_JOB_PAUSE: "暂停恢复任务",
  ADMIN_RESTORE_JOB_CANCELED: "取消恢复任务",
  ADMIN_RESTORE_JOB_SCAN_DONE: "恢复任务扫描完成",
  ADMIN_RESTORE_JOB_SNAPSHOT_SKIPPED: "恢复任务跳过快照",
  ADMIN_RESTORE_JOB_SNAPSHOT_DONE: "恢复任务快照完成",
  ADMIN_RESTORE_JOB_DONE: "恢复任务完成",
  ADMIN_RESTORE_JOB_FAILED: "恢复任务失败",
  ADMIN_RESTORE_JOB_ROLLBACK_CREATE: "创建恢复回滚任务",

  PC_IN: "电脑入库",
  PC_IN_BATCH: "批量电脑入库",
  PC_OUT: "电脑出库",
  PC_OUT_BATCH: "批量电脑出库",
  PC_RETURN: "电脑归还",
  PC_RETURN_BATCH: "批量电脑归还",
  PC_RECYCLE: "电脑回收",
  PC_RECYCLE_BATCH: "批量电脑回收",
  PC_SCRAP: "电脑报废",
  PC_ASSET_UPDATE: "修改电脑台账",
  PC_ASSET_DELETE: "删除电脑台账",
  PC_ASSET_PURGE: "彻底删除电脑台账",
  PC_TX_DELETE: "删除电脑事务",
  PC_TX_CLEAR: "清空电脑事务",
  PC_LOCATION_CREATE: "新增电脑位置",
  PC_LOCATION_UPDATE: "修改电脑位置",
  PC_LOCATION_DELETE: "删除电脑位置",
  PC_INVENTORY_LOG_DELETE: "删除电脑盘点记录",
  PC_INVENTORY_LOG_EXPORT: "导出电脑盘点记录",

  MONITOR_SCHEMA_INIT: "初始化显示器模块",
  MONITOR_ASSET_CREATE: "新增显示器台账",
  MONITOR_ASSET_UPDATE: "修改显示器台账",
  MONITOR_ASSET_DELETE: "删除显示器台账",
  MONITOR_ASSET_PURGE: "彻底删除显示器台账",
  PC_ASSET_ARCHIVE: "归档电脑台账",
  PC_ASSET_ARCHIVE_BATCH: "批量归档电脑台账",
  PC_ASSET_RESTORE_BATCH: "批量恢复电脑归档",
  PC_ASSET_STATUS_BATCH: "批量修改电脑状态",
  PC_ASSET_OWNER_BATCH: "批量修改电脑领用人",
  MONITOR_ASSET_ARCHIVE: "归档显示器台账",
  MONITOR_ASSET_ARCHIVE_BATCH: "批量归档显示器台账",
  MONITOR_ASSET_RESTORE_BATCH: "批量恢复显示器归档",
  MONITOR_ASSET_STATUS_BATCH: "批量修改显示器状态",
  MONITOR_ASSET_LOCATION_BATCH: "批量修改显示器位置",
  MONITOR_ASSET_OWNER_BATCH: "批量修改显示器领用人",
  MONITOR_IN: "显示器入库",
  MONITOR_OUT: "显示器出库",
  MONITOR_RETURN: "显示器归还",
  MONITOR_TRANSFER: "显示器调拨",
  MONITOR_SCRAP: "显示器报废",
  MONITOR_TX_DELETE: "删除显示器事务",
  MONITOR_TX_EXPORT: "导出显示器事务",
  MONITOR_INVENTORY_LOG_DELETE: "删除显示器盘点记录",
  MONITOR_INVENTORY_LOG_EXPORT: "导出显示器盘点记录",
  SYSTEM_DICTIONARY_CREATE: "新增系统字典项",
  SYSTEM_DICTIONARY_UPDATE: "修改系统字典项",
  SYSTEM_DICTIONARY_DELETE: "删除系统字典项",
  SYSTEM_DICTIONARY_REORDER: "调整系统字典排序",

  pc_asset_update: "修改电脑台账",
  pc_asset_delete: "删除电脑台账",
  pc_asset_purge: "彻底删除电脑台账",
  pc_tx_delete: "删除电脑事务",
  pc_tx_clear: "清空电脑事务",
  monitor_asset_create: "新增显示器台账",
  monitor_asset_update: "修改显示器台账",
  monitor_asset_delete: "删除显示器台账",
  monitor_asset_purge: "彻底删除显示器台账",
};

const ACTION_TOKEN_LABEL: Record<string, string> = {
  STOCK: '库存',
  STOCKTAKE: '盘点',
  ITEM: '配件',
  ITEMS: '配件',
  USER: '用户',
  USERS: '用户',
  AUDIT: '审计',
  ADMIN: '系统管理',
  PC: '电脑',
  MONITOR: '显示器',
  ASSET: '台账',
  ASSETS: '台账',
  TX: '事务',
  INVENTORY: '盘点',
  LOG: '记录',
  LOCATION: '位置',
  LOCATIONS: '位置',
  DICTIONARY: '字典',
  DICTIONARIES: '字典',
  SYSTEM: '系统',
  SCHEMA: '结构',
  BACKUP: '备份',
  RESTORE: '恢复',
  JOB: '任务',
  STOCK_TX: '出入库流水',
  CREATE: '新增',
  UPDATE: '修改',
  DELETE: '删除',
  PURGE: '彻底删除',
  ARCHIVE: '归档',
  BATCH: '批量',
  STATUS: '状态',
  OWNER: '领用人',
  PASSWORD: '密码',
  INIT: '初始化',
  IN: '入库',
  OUT: '出库',
  RETURN: '归还',
  RECYCLE: '回收',
  SCRAP: '报废',
  EXPORT: '导出',
  IMPORT: '导入',
  APPLY: '应用',
  ROLLBACK: '回滚',
  CLEAR: '清空',
  RESET: '重置',
  TRANSFER: '调拨',
  PAUSE: '暂停',
  CANCELED: '取消',
  CANCEL: '取消',
  SCAN: '扫描',
  SNAPSHOT: '快照',
  SKIPPED: '跳过',
  DONE: '完成',
  FAILED: '失败',
  UPLOAD: '上传',
  RETENTION: '保留',
  THROTTLE: '限流',
};

const ACTION_VERB_TOKENS = new Set([
  'CREATE', 'UPDATE', 'DELETE', 'PURGE', 'ARCHIVE', 'RESTORE', 'EXPORT', 'IMPORT', 'APPLY',
  'ROLLBACK', 'CLEAR', 'RESET', 'INIT', 'IN', 'OUT', 'RETURN', 'RECYCLE', 'SCRAP', 'TRANSFER',
  'PAUSE', 'CANCELED', 'CANCEL', 'SCAN', 'DONE', 'FAILED', 'UPLOAD',
]);

export const ENTITY_LABEL: Record<string, string> = {
  stock_tx: "出入库流水",
  stocktake: "盘点单",
  items: "配件",
  users: "用户",
  audit_log: "审计日志",
  stock: "库存",
  warehouse: "仓库",
  warehouses: "仓库",
  backup: "备份",
  restore_job: "恢复任务",
  schema: "系统结构",
  pc_assets: "电脑台账",
  pc_in: "电脑入库记录",
  pc_out: "电脑出库记录",
  pc_recycle: "电脑回收记录",
  pc_scrap: "电脑报废记录",
  pc_tx: "电脑事务",
  pc_tx_detail: "电脑事务明细",
  pc_locations: "电脑位置",
  pc_inventory_log: "电脑盘点记录",
  monitor_assets: "显示器台账",
  monitor_tx: "显示器事务",
  monitor_inventory_log: "显示器盘点记录",
  system_dictionary_items: "系统字典项",
};

const FIELD_LABEL: Record<string, string> = {
  id: 'ID',
  brand: '品牌',
  model: '型号',
  serial_no: '序列号',
  asset_code: '资产编号',
  sn: 'SN',
  status: '状态',
  remark: '备注',
  employee_no: '员工工号',
  employee_name: '领用人',
  department: '部门',
  location_id: '位置ID',
  location_name: '位置',
  location_text: '位置',
  size_inch: '尺寸',
  disk_capacity: '硬盘容量',
  memory_size: '内存大小',
  manufacture_date: '出厂时间',
  warranty_end: '保修到期',
  retention_days: '保留天数',
  confirm: '确认词',
  reason: '原因',
  created_by: '创建人',
  updated_at: '更新时间',
};

export const HIDDEN_PAYLOAD_KEYS = new Set(['password', 'new_password', 'old_password', 'confirm']);

export const MODULE_LABEL: Record<string, string> = {
  STOCK: '库存',
  STOCKTAKE: '盘点',
  ITEM: '配件',
  USER: '用户',
  AUDIT: '审计',
  ADMIN: '系统管理',
  PC: '电脑资产',
  MONITOR: '显示器资产',
  OTHER: '其他',
};

export const moduleOptions = Object.entries(MODULE_LABEL).map(([value, label]) => ({ value, label }));

export function fieldLabel(key: string) {
  return FIELD_LABEL[key] || prettifyCodeLabel(key) || '-';
}

export function prettifyCodeLabel(value: string) {
  return String(value || "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitCodeTokens(value: string) {
  return String(value || '')
    .trim()
    .replace(/[.\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .split('_')
    .filter(Boolean);
}

export function translateActionCode(value: string) {
  const tokens = splitCodeTokens(value).map((token) => token.toUpperCase());
  if (!tokens.length) return '';

  const hasBatch = tokens.includes('BATCH');
  const coreTokens = tokens.filter((token) => token !== 'BATCH');
  const verbIndex = [...coreTokens].reverse().findIndex((token) => ACTION_VERB_TOKENS.has(token));

  if (verbIndex !== -1) {
    const actualVerbIndex = coreTokens.length - 1 - verbIndex;
    const verbToken = coreTokens[actualVerbIndex];
    const verb = ACTION_TOKEN_LABEL[verbToken] || '';
    const target = coreTokens
      .filter((_, index) => index !== actualVerbIndex)
      .map((token) => ACTION_TOKEN_LABEL[token] || ENTITY_LABEL[token.toLowerCase()] || prettifyCodeLabel(token))
      .join('');
    if (verb) return `${hasBatch ? '批量' : ''}${verb}${target}`;
  }

  const translated = tokens
    .map((token) => ACTION_TOKEN_LABEL[token] || ENTITY_LABEL[token.toLowerCase()] || '')
    .filter(Boolean)
    .join('');
  return translated || '';
}

export function translateEntityCode(value: string) {
  const tokens = splitCodeTokens(value).map((token) => token.toLowerCase());
  if (!tokens.length) return '';
  return tokens
    .map((token) => ENTITY_LABEL[token] || ACTION_TOKEN_LABEL[token.toUpperCase()] || '')
    .filter(Boolean)
    .join('');
}

export function actionLabel(a: string) {
  return ACTION_LABEL[a] || translateActionCode(a) || prettifyCodeLabel(a) || "-";
}

export function entityLabel(e: string) {
  return ENTITY_LABEL[e] || translateEntityCode(e) || prettifyCodeLabel(e) || "-";
}

export function formatTime(s?: string) {
  return s ? formatBeijingDateTime(s) : "-";
}

export function getModuleOf(row: any) {
  const moduleCode = String(row?.module_code || '').toUpperCase();
  if (moduleCode && MODULE_LABEL[moduleCode]) return moduleCode;
  const actionCode = String(row?.action || '').toUpperCase();
  const entityCode = String(row?.entity || '').toLowerCase();
  if (actionCode.startsWith('STOCKTAKE') || entityCode.includes('stocktake')) return 'STOCKTAKE';
  if (actionCode.startsWith('STOCK_') || entityCode === 'stock' || entityCode === 'stock_tx') return 'STOCK';
  if (actionCode.startsWith('ITEM_') || entityCode === 'items') return 'ITEM';
  if (actionCode.startsWith('USER_') || entityCode === 'users') return 'USER';
  if (actionCode.startsWith('AUDIT_') || entityCode === 'audit_log') return 'AUDIT';
  if (actionCode.startsWith('ADMIN_') || entityCode === 'restore_job' || entityCode === 'backup' || entityCode === 'schema') return 'ADMIN';
  if (actionCode.startsWith('PC_') || entityCode.startsWith('pc_')) return 'PC';
  if (actionCode.startsWith('MONITOR_') || entityCode.startsWith('monitor_')) return 'MONITOR';
  return 'OTHER';
}

export function isHighRiskRow(row: any) {
  if (row?.high_risk != null) return Number(row.high_risk || 0) === 1;
  const actionCode = String(row?.action || '').toUpperCase();
  return ['DELETE', 'ARCHIVE', 'SCRAP', 'ROLLBACK', 'RESET_PASSWORD', 'RESTORE', 'CLEAR'].some((token) => actionCode.includes(token));
}

export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.length ? value.map((item) => formatAuditValue(item)).join('、') : '-';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '[对象]';
    }
  }
  return String(value);
}

export function tagType(action: string) {
  const a = String(action || "").toUpperCase();
  if (a.includes("DELETE") || a.includes("CLEAR")) return "danger";
  if (a.includes("ROLLBACK") || a.includes("DISABLE") || a.includes("RESET")) return "warning";
  if (a.includes("STOCK_OUT") || a.includes("OUT")) return "warning";
  if (a.includes("STOCK_IN") || a.includes("IN")) return "success";
  return "info";
}