import * as XLSX from "xlsx";

export function exportToXlsx(filename: string, sheetName: string, rows: any[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function readFirstSheet(file: File) {
  return new Promise<any[]>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
        resolve(json as any[]);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function exportTemplateItems() {
  const rows = [
    { "SKU": "SSD-1T-NVME", "名称": "NVMe SSD 1TB", "品牌": "Samsung", "型号": "980", "分类": "硬盘", "单位": "块", "预警值": 1 },
    { "SKU": "CPU-001", "名称": "CPU i5", "品牌": "Intel", "型号": "12400F", "分类": "CPU", "单位": "颗", "预警值": 1 },
  ];
  exportToXlsx("配件导入模板.xlsx", "items", rows);
}
