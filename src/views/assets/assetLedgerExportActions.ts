export type ExcelHeader = { key: string; title: string };

type LoadExcelUtils = () => Promise<{ exportToXlsx: (args: { filename: string; sheetName: string; headers: ExcelHeader[]; rows: Array<Record<string, any>> }) => void }>;

const pcLedgerHeaders: ExcelHeader[] = [
  { key: 'id', title: 'ID' },
  { key: 'status', title: '状态' },
  { key: 'brand', title: '品牌' },
  { key: 'serial_no', title: '序列号' },
  { key: 'model', title: '型号' },
  { key: 'manufacture_date', title: '出厂时间' },
  { key: 'warranty_end', title: '保修到期' },
  { key: 'disk_capacity', title: '硬盘容量' },
  { key: 'memory_size', title: '内存大小' },
  { key: 'remark', title: '备注' },
  { key: 'created_at', title: '创建时间' },
  { key: 'updated_at', title: '更新时间' },
];

const pcArchiveHeaders: ExcelHeader[] = [
  { key: 'id', title: 'ID' },
  { key: 'status', title: '状态' },
  { key: 'brand', title: '品牌' },
  { key: 'serial_no', title: '序列号' },
  { key: 'model', title: '型号' },
  { key: 'archived_reason', title: '归档原因' },
  { key: 'archived_note', title: '归档备注' },
  { key: 'archived_by', title: '归档人' },
  { key: 'archived_at', title: '归档时间' },
];

const monitorLedgerHeaders: ExcelHeader[] = [
  { key: 'id', title: 'ID' },
  { key: 'asset_code', title: '资产编号' },
  { key: 'sn', title: 'SN' },
  { key: 'brand', title: '品牌' },
  { key: 'model', title: '型号' },
  { key: 'size_inch', title: '尺寸' },
  { key: 'status', title: '状态' },
  { key: 'location_text', title: '位置' },
  { key: 'employee_name', title: '领用人' },
  { key: 'employee_no', title: '员工工号' },
  { key: 'department', title: '部门' },
  { key: 'remark', title: '备注' },
  { key: 'updated_at', title: '更新时间' },
];

const monitorArchiveHeaders: ExcelHeader[] = [
  { key: 'id', title: 'ID' },
  { key: 'asset_code', title: '资产编号' },
  { key: 'sn', title: 'SN' },
  { key: 'brand', title: '品牌' },
  { key: 'model', title: '型号' },
  { key: 'status', title: '状态' },
  { key: 'location_text', title: '位置' },
  { key: 'archived_reason', title: '归档原因' },
  { key: 'archived_note', title: '归档备注' },
  { key: 'archived_by', title: '归档人' },
  { key: 'archived_at', title: '归档时间' },
];

async function exportWorkbook(options: {
  filename: string;
  sheetName: string;
  headers: ExcelHeader[];
  rows: Array<Record<string, any>>;
  loadExcelUtils: LoadExcelUtils;
}) {
  const { exportToXlsx } = await options.loadExcelUtils();
  exportToXlsx({ filename: options.filename, sheetName: options.sheetName, headers: options.headers, rows: options.rows });
}

export async function exportPcSelectedRows(options: { rows: Array<Record<string, any>>; loadExcelUtils: LoadExcelUtils; assetStatusText: (status: string) => string; formatBeijingDateTime: (value: any) => string; }) {
  await exportWorkbook({
    filename: `电脑台账_已选_${options.rows.length}条.xlsx`,
    sheetName: '已选台账',
    headers: pcLedgerHeaders,
    rows: options.rows.map((row) => ({ ...row, status: options.assetStatusText(String(row.status || '')), created_at: options.formatBeijingDateTime(row.created_at), updated_at: options.formatBeijingDateTime(row.updated_at) })),
    loadExcelUtils: options.loadExcelUtils,
  });
}

export async function exportPcAllRows(options: { rows: Array<Record<string, any>>; loadExcelUtils: LoadExcelUtils; assetStatusText: (status: string) => string; formatBeijingDateTime: (value: any) => string; }) {
  await exportWorkbook({
    filename: '电脑台账_仓库2.xlsx',
    sheetName: '台账',
    headers: pcLedgerHeaders,
    rows: options.rows.map((row) => ({ ...row, status: options.assetStatusText(String(row.status || '')), created_at: options.formatBeijingDateTime(row.created_at), updated_at: options.formatBeijingDateTime(row.updated_at) })),
    loadExcelUtils: options.loadExcelUtils,
  });
}

export async function exportPcArchiveRows(options: { rows: Array<Record<string, any>>; loadExcelUtils: LoadExcelUtils; assetStatusText: (status: string) => string; formatBeijingDateTime: (value: any) => string; }) {
  await exportWorkbook({
    filename: `电脑归档记录_${options.rows.length}条.xlsx`,
    sheetName: '电脑归档',
    headers: pcArchiveHeaders,
    rows: options.rows.map((row) => ({ ...row, status: options.assetStatusText(String(row.status || '')), archived_at: options.formatBeijingDateTime(row.archived_at) })),
    loadExcelUtils: options.loadExcelUtils,
  });
}

export async function exportMonitorSelectedRows(options: { rows: Array<Record<string, any>>; loadExcelUtils: LoadExcelUtils; assetStatusText: (status: string) => string; locationText: (row: any) => string; }) {
  await exportWorkbook({
    filename: `显示器台账_已选_${options.rows.length}条.xlsx`,
    sheetName: '已选台账',
    headers: monitorLedgerHeaders,
    rows: options.rows.map((row) => ({ ...row, status: options.assetStatusText(String(row.status || '')), location_text: options.locationText(row) })),
    loadExcelUtils: options.loadExcelUtils,
  });
}

export async function exportMonitorAllRows(options: { rows: Array<Record<string, any>>; loadExcelUtils: LoadExcelUtils; assetStatusText: (status: string) => string; locationText: (row: any) => string; }) {
  await exportWorkbook({
    filename: '显示器台账.xlsx',
    sheetName: '显示器台账',
    headers: monitorLedgerHeaders,
    rows: options.rows.map((row) => ({ ...row, status: options.assetStatusText(String(row.status || '')), location_text: options.locationText(row) })),
    loadExcelUtils: options.loadExcelUtils,
  });
}

export async function exportMonitorArchiveRows(options: { rows: Array<Record<string, any>>; loadExcelUtils: LoadExcelUtils; assetStatusText: (status: string) => string; locationText: (row: any) => string; formatBeijingDateTime: (value: any) => string; }) {
  await exportWorkbook({
    filename: `显示器归档记录_${options.rows.length}条.xlsx`,
    sheetName: '显示器归档',
    headers: monitorArchiveHeaders,
    rows: options.rows.map((row) => ({ ...row, status: options.assetStatusText(String(row.status || '')), location_text: options.locationText(row), archived_at: options.formatBeijingDateTime(row.archived_at) })),
    loadExcelUtils: options.loadExcelUtils,
  });
}
