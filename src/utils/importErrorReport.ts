export type ImportErrorRow = {
  row: number;
  col: string;
  msg: string;
  val?: unknown;
};

type FormatImportErrorOptions = {
  limit?: number;
};

// 保持各导入页已有展示格式：最多 N 条、使用 <br/> 分隔、仅 val 存在时展示“当前值”。
export function formatImportErrorHtml(errors: ImportErrorRow[], options: FormatImportErrorOptions = {}) {
  const limit = Math.max(1, Number(options.limit || 12));
  const preview = errors
    .slice(0, limit)
    .map((error) => `第${error.row}行【${error.col}】${error.msg}${error.val !== undefined ? `（当前：${String(error.val)}）` : ''}`)
    .join('<br/>');
  return `${preview}${errors.length > limit ? `<br/>…（仅展示前 ${limit} 条）` : ''}`;
}