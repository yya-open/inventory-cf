export function extractAffectedIds(result: any, fallbackIds: Array<number | string> = []) {
  const source = Array.isArray(result?.affected_ids) ? result.affected_ids : fallbackIds;
  return source.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id));
}

export function buildBulkDeleteConfirmTip(noun: string, selectedCount: number, archivedCount: number) {
  const activeCount = Math.max(0, Number(selectedCount || 0) - Number(archivedCount || 0));
  if (archivedCount && activeCount) {
    return `选中的 ${selectedCount} 台${noun}中，已归档的 ${archivedCount} 台会被彻底删除并清理历史记录，其余 ${activeCount} 台仍按原规则执行：有历史记录则自动归档，满足条件才物理删除。请输入“确认”继续。`;
  }
  if (archivedCount) {
    return `选中的 ${archivedCount} 台归档${noun}会被彻底删除，并同时清理关联历史记录。请输入“确认”继续。`;
  }
  return `选中的 ${selectedCount} 台${noun}中，有历史记录的资产会自动转归档，只有满足条件的资产会物理删除。请输入“确认”继续。`;
}

export function summarizeBulkDeleteResult(noun: string, result: any) {
  const processed = Number(result?.processed || 0);
  const failed = Number(result?.failed || 0);
  const archived = Number(result?.archived || 0);
  const deleted = Number(result?.deleted || 0);
  const purged = Number(result?.purged || 0);
  const successMessage = archived || purged
    ? `已处理 ${processed} 台${noun}（其中归档 ${archived} 台，彻底删除 ${purged} 台，物理删除 ${deleted} 台）`
    : `已删除 ${deleted} 台${noun}`;
  const warningMessage = `已处理 ${processed} 台，失败 ${failed} 台${archived ? `，其中归档 ${archived} 台` : ''}${purged ? `，彻底删除 ${purged} 台` : ''}${deleted ? `，物理删除 ${deleted} 台` : ''}`;
  return {
    processed,
    failed,
    archived,
    deleted,
    purged,
    failedRecords: Array.isArray(result?.failed_records) ? result.failed_records : [],
    level: processed && !failed ? 'success' : (processed || failed ? 'warning' : 'none'),
    message: processed && !failed ? successMessage : (processed || failed ? warningMessage : ''),
  };
}
