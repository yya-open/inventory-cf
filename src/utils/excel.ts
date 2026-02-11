import * as XLSX from "xlsx";

type OrderedHeader = { key: string; title: string };

/**
 * exportToXlsx 兼容两种调用方式：
 * 1) exportToXlsx("文件.xlsx", "Sheet1", rows)
 * 2) exportToXlsx({ filename, headers, rows, sheetName })
 */
export function exportToXlsx(filename: string, sheetName: string, rows: any[]): void;
export function exportToXlsx(options: {
  filename: string;
  headers: OrderedHeader[];
  rows: any[];
  sheetName?: string;
}): void;
export function exportToXlsx(a: any, b?: any, c?: any) {
  // 方式1：exportToXlsx(filename, sheetName, rows)
  if (typeof a === "string") {
    const filename = a as string;
    const sheetName = (b as string) || "Sheet1";
    const rows = (c as any[]) || [];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
    return;
  }

  // 方式2：exportToXlsx({ filename, headers, rows, sheetName })
  const { filename, headers, rows, sheetName } = a as {
    filename: string;
    headers: OrderedHeader[];
    rows: any[];
    sheetName?: string;
  };

  const data = (rows || []).map((r) => {
    const o: any = {};
    (headers || []).forEach((h) => (o[h.title] = r?.[h.key] ?? ""));
    return o;
  });

  const ws = XLSX.utils.json_to_sheet(data, { header: headers.map((h) => h.title) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || "Sheet1");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/** 下载模板：只按 title 生成列，并可带示例行 */
export function downloadTemplate(options: {
  filename: string;
  headers: { title: string }[];
  exampleRows?: Record<string, any>[];
  sheetName?: string;
}) {
  const { filename, headers, exampleRows, sheetName } = options;
  const data = (exampleRows && exampleRows.length ? exampleRows : [{}]).map((r) => {
    const o: any = {};
    headers.forEach((h) => (o[h.title] = r?.[h.title] ?? ""));
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: headers.map((h) => h.title) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || "Sheet1");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/** 解析 Excel 第一张表，返回对象数组（key 为表头文字） */
export async function parseXlsx(file: File): Promise<Record<string, any>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, any>[];
}

/** 兼容旧代码：readFirstSheet(file) */
export function readFirstSheet(file: File) {
  return parseXlsx(file);
}

/** ✅ 给 ImportItems.vue 用：下载“配件导入模板” */
export function exportTemplateItems() {
  downloadTemplate({
    filename: "配件导入模板.xlsx",
    headers: [
      { title: "SKU" },
      { title: "名称" },
      { title: "品牌" },
      { title: "型号" },
      { title: "分类" },
      { title: "单位" },
      { title: "预警值" },
    ],
    exampleRows: [
      { SKU: "SSD-1T-NVME", 名称: "NVMe SSD 1TB", 品牌: "Samsung", 型号: "980", 分类: "硬盘", 单位: "块", 预警值: 1 },
      { SKU: "CPU-001", 名称: "CPU i5", 品牌: "Intel", 型号: "12400F", 分类: "CPU", 单位: "颗", 预警值: 1 },
    ],
    sheetName: "items",
  });
}
