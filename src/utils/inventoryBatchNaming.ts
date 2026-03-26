import type { InventoryBatchKind } from '../api/inventoryBatches';

function formatDatePart(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function labelForKind(kind: InventoryBatchKind) {
  return kind === 'pc' ? '电脑' : '显示器';
}

function extractDateAndSeq(name: string) {
  const text = String(name || '').trim();
  if (!text) return null;
  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return null;
  const seqMatch = text.match(/第\s*(\d+)\s*轮/);
  return {
    date: dateMatch[1],
    seq: seqMatch ? Math.max(1, Number(seqMatch[1]) || 1) : 1,
  };
}

export function buildSuggestedInventoryBatchName(kind: InventoryBatchKind, existingNames: Array<string | null | undefined>, date = new Date()) {
  const day = formatDatePart(date);
  let maxSeq = 0;
  for (const item of existingNames || []) {
    const parsed = extractDateAndSeq(String(item || ''));
    if (parsed?.date === day) maxSeq = Math.max(maxSeq, parsed.seq);
  }
  const nextSeq = maxSeq + 1 || 1;
  return `${labelForKind(kind)}盘点 ${day} 第${nextSeq}轮`;
}
