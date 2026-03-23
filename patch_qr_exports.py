from pathlib import Path

def patch_file(path_str, kind, sheet_type):
    p = Path(path_str)
    text = p.read_text()
    marker = "async function exportSelectedQrPng() {"
    idx = text.find(marker)
    if idx == -1:
        raise SystemExit(f'marker not found in {path_str}')
    end = text.find("function openAuditHistory", idx)
    old = text[idx:end]
    if kind == 'pc':
        local = '''async function exportSelectedQrPngLocal() {
  const qrLinks = await fetchBulkPcAssetQrLinks(selectedRows.value.map((row) => Number(row.id)));
  const qrLinkMap = new Map<number, string>(qrLinks.map((item: { id: number; url: string }) => [item.id, item.url] as [number, string]));
  const records: Array<{ title: string; subtitle?: string; meta: Array<{ label: string; value: string }>; url: string }> = [];
  for (const row of selectedRows.value) {
    const link = qrLinkMap.get(Number(row.id)) || '';
    if (!link) continue;
    records.push({
      title: [row.brand, row.model].filter(Boolean).join(' · ') || `电脑 #${row.id}`,
      subtitle: `SN：${row.serial_no || '-'} · 状态：${assetStatusText(row.status)}`,
      meta: [
        { label: '领用人', value: row.last_employee_name || '-' },
        { label: '工号', value: row.last_employee_no || '-' },
        { label: '部门', value: row.last_department || '-' },
        { label: '归档', value: Number(row.archived || 0) === 1 ? '已归档' : '在用' },
      ],
      url: link,
    });
  }
  if (!records.length) return ElMessage.warning('当前选中项没有可导出的二维码');
  const { downloadQrCardsPng } = await loadQrCardUtils();
  await downloadQrCardsPng(`电脑二维码图版_${records.length}条`, '电脑二维码图版', records);
  ElMessage.success('二维码图版(PNG)已导出');
}

async function exportSelectedQrCardsLocal() {
  const qrLinks = await fetchBulkPcAssetQrLinks(selectedRows.value.map((row) => Number(row.id)));
  const qrLinkMap = new Map<number, string>(qrLinks.map((item: { id: number; url: string }) => [item.id, item.url] as [number, string]));
  const records = [] as Array<{ title: string; subtitle: string; meta: Array<{ label: string; value: string }>; url: string }>;
  for (const row of selectedRows.value) {
    const url = qrLinkMap.get(Number(row.id)) || '';
    if (!url) continue;
    records.push({
      title: `${row.brand || '-'} ${row.model || ''}`.trim(),
      subtitle: `SN：${row.serial_no || '-'}`,
      meta: [
        { label: '状态', value: assetStatusText(row.status) },
        { label: '序列号', value: row.serial_no || '-' },
        { label: '领用人', value: row.last_employee_name || '-' },
      ],
      url,
    });
  }
  if (!records.length) return ElMessage.warning('当前选中项没有可导出的二维码');
  const { downloadQrCardsHtml } = await loadQrCardUtils();
  await downloadQrCardsHtml(`电脑二维码卡片_${records.length}条`, '电脑二维码卡片', records);
  ElMessage.success('二维码卡片已导出，可直接打印');
}
'''
        replace1_old = '''async function exportSelectedQrCards() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  try {
    batchBusy.value = true;
    const qrLinks = await fetchBulkPcAssetQrLinks(selectedRows.value.map((row) => Number(row.id)));
    const qrLinkMap = new Map<number, string>(qrLinks.map((item: { id: number; url: string }) => [item.id, item.url] as [number, string]));
    const records = [] as Array<{ title: string; subtitle: string; meta: Array<{ label: string; value: string }>; url: string }>;
    for (const row of selectedRows.value) {
      const url = qrLinkMap.get(Number(row.id)) || '';
      if (!url) continue;
      records.push({
        title: `${row.brand || '-'} ${row.model || ''}`.trim(),
        subtitle: `SN：${row.serial_no || '-'}`,
        meta: [
          { label: '状态', value: assetStatusText(row.status) },
          { label: '序列号', value: row.serial_no || '-' },
          { label: '领用人', value: row.last_employee_name || '-' },
        ],
        url,
      });
    }
    if (!records.length) return ElMessage.warning('当前选中项没有可导出的二维码');
    const { downloadQrCardsHtml } = await loadQrCardUtils();
    await downloadQrCardsHtml(`电脑二维码卡片_${records.length}条`, '电脑二维码卡片', records);
    ElMessage.success('二维码卡片已导出，可直接打印');
  } catch (error: any) {
    ElMessage.error(error?.message || '导出二维码卡片失败');
  } finally {
    batchBusy.value = false;
  }
}
'''
        replace1_new = '''async function exportSelectedQrCards() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  try {
    exportBusy.value = true;
    if (!isAdmin.value) {
      await exportSelectedQrCardsLocal();
      return;
    }
    const ids = selectedRows.value.map((row) => Number(row.id));
    const result: any = await apiPost('/api/jobs', { job_type: 'PC_QR_CARDS_EXPORT', request_json: { ids, origin: window.location.origin }, retain_days: 7, max_retries: 1 });
    const jobId = Number(result?.data?.id || result?.id || 0);
    ElMessage.success(jobId ? `任务已创建（#${jobId}），可在“系统工具 / 异步任务”下载二维码卡片` : '任务已创建，可在“系统工具 / 异步任务”下载二维码卡片');
  } catch (error: any) {
    ElMessage.error(error?.message || '导出二维码卡片失败');
  } finally {
    exportBusy.value = false;
  }
}
'''
    else:
        local = '''async function exportSelectedQrPngLocal() {
  const qrLinks = await fetchBulkMonitorAssetQrLinks(selectedRows.value.map((row) => Number(row.id)));
  const qrLinkMap = new Map<number, string>(qrLinks.map((item: { id: number; url: string }) => [item.id, item.url] as [number, string]));
  const records: Array<{ title: string; subtitle?: string; meta: Array<{ label: string; value: string }>; url: string }> = [];
  for (const row of selectedRows.value) {
    const link = qrLinkMap.get(Number(row.id)) || '';
    if (!link) continue;
    records.push({
      title: row.asset_code || `显示器 #${row.id}`,
      subtitle: [row.brand, row.model].filter(Boolean).join(' · ') || `SN：${row.sn || '-'}`,
      meta: [
        { label: '状态', value: assetStatusText(row.status) },
        { label: '位置', value: locationText(row) },
        { label: '领用人', value: row.employee_name || '-' },
        { label: '归档', value: Number(row.archived || 0) === 1 ? '已归档' : '在用' },
      ],
      url: link,
    });
  }
  if (!records.length) return ElMessage.warning('当前选中项没有可导出的二维码');
  const { downloadQrCardsPng } = await loadQrCardUtils();
  await downloadQrCardsPng(`显示器二维码图版_${records.length}条`, '显示器二维码图版', records);
  ElMessage.success('二维码图版(PNG)已导出');
}

async function exportSelectedQrCardsLocal() {
  const qrLinks = await fetchBulkMonitorAssetQrLinks(selectedRows.value.map((row) => Number(row.id)));
  const qrLinkMap = new Map<number, string>(qrLinks.map((item: { id: number; url: string }) => [item.id, item.url] as [number, string]));
  const records = [] as Array<{ title: string; subtitle: string; meta: Array<{ label: string; value: string }>; url: string }>;
  for (const row of selectedRows.value) {
    const url = qrLinkMap.get(Number(row.id)) || '';
    if (!url) continue;
    records.push({
      title: `${row.asset_code || '-'} ${row.brand || ''}`.trim(),
      subtitle: `${row.model || '-'} · SN：${row.sn || '-'}`,
      meta: [
        { label: '状态', value: assetStatusText(row.status) },
        { label: '位置', value: locationText(row) },
        { label: '领用人', value: row.employee_name || '-' },
      ],
      url,
    });
  }
  if (!records.length) return ElMessage.warning('当前选中项没有可导出的二维码');
  const { downloadQrCardsHtml } = await loadQrCardUtils();
  await downloadQrCardsHtml(`显示器二维码卡片_${records.length}条`, '显示器二维码卡片', records);
  ElMessage.success('二维码卡片已导出，可直接打印');
}
'''
        replace1_old = '''async function exportSelectedQrCards() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  try {
    batchBusy.value = true;
    const qrLinks = await fetchBulkMonitorAssetQrLinks(selectedRows.value.map((row) => Number(row.id)));
    const qrLinkMap = new Map<number, string>(qrLinks.map((item: { id: number; url: string }) => [item.id, item.url] as [number, string]));
    const records = [] as Array<{ title: string; subtitle: string; meta: Array<{ label: string; value: string }>; url: string }>;
    for (const row of selectedRows.value) {
      const url = qrLinkMap.get(Number(row.id)) || '';
      if (!url) continue;
      records.push({
        title: `${row.asset_code || '-'} ${row.brand || ''}`.trim(),
        subtitle: `${row.model || '-'} · SN：${row.sn || '-'}`,
        meta: [
          { label: '状态', value: assetStatusText(row.status) },
          { label: '位置', value: locationText(row) },
          { label: '领用人', value: row.employee_name || '-' },
        ],
        url,
      });
    }
    if (!records.length) return ElMessage.warning('当前选中项没有可导出的二维码');
    const { downloadQrCardsHtml } = await loadQrCardUtils();
    await downloadQrCardsHtml(`显示器二维码卡片_${records.length}条`, '显示器二维码卡片', records);
    ElMessage.success('二维码卡片已导出，可直接打印');
  } catch (error: any) {
    ElMessage.error(error?.message || '导出二维码卡片失败');
  } finally {
    batchBusy.value = false;
  }
}
'''
        replace1_new = '''async function exportSelectedQrCards() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  try {
    exportBusy.value = true;
    if (!isAdmin.value) {
      await exportSelectedQrCardsLocal();
      return;
    }
    const ids = selectedRows.value.map((row) => Number(row.id));
    const result: any = await apiPost('/api/jobs', { job_type: 'MONITOR_QR_CARDS_EXPORT', request_json: { ids, origin: window.location.origin }, retain_days: 7, max_retries: 1 });
    const jobId = Number(result?.data?.id || result?.id || 0);
    ElMessage.success(jobId ? `任务已创建（#${jobId}），可在“系统工具 / 异步任务”下载二维码卡片` : '任务已创建，可在“系统工具 / 异步任务”下载二维码卡片');
  } catch (error: any) {
    ElMessage.error(error?.message || '导出二维码卡片失败');
  } finally {
    exportBusy.value = false;
  }
}
'''
    replace2_old = old
    replace2_new = local + old
    text = text.replace(old, replace2_new)
    text = text.replace(replace1_old, replace1_new)
    if kind == 'pc':
        png_old = '''async function exportSelectedQrPng() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  try {
    exportBusy.value = true;
    const qrLinks = await fetchBulkPcAssetQrLinks(selectedRows.value.map((row) => Number(row.id)));
    const qrLinkMap = new Map<number, string>(qrLinks.map((item: { id: number; url: string }) => [item.id, item.url] as [number, string]));
    const records: Array<{ title: string; subtitle?: string; meta: Array<{ label: string; value: string }>; url: string }> = [];
    for (const row of selectedRows.value) {
      const link = qrLinkMap.get(Number(row.id)) || '';
      if (!link) continue;
      records.push({
        title: [row.brand, row.model].filter(Boolean).join(' · ') || `电脑 #${row.id}`,
        subtitle: `SN：${row.serial_no || '-'} · 状态：${assetStatusText(row.status)}`,
        meta: [
          { label: '领用人', value: row.last_employee_name || '-' },
          { label: '工号', value: row.last_employee_no || '-' },
          { label: '部门', value: row.last_department || '-' },
          { label: '归档', value: Number(row.archived || 0) === 1 ? '已归档' : '在用' },
        ],
        url: link,
      });
    }
    if (!records.length) return ElMessage.warning('当前选中项没有可导出的二维码');
    const { downloadQrCardsPng } = await loadQrCardUtils();
    await downloadQrCardsPng(`电脑二维码图版_${records.length}条`, '电脑二维码图版', records);
    ElMessage.success('二维码图版(PNG)已导出');
  } catch (error: any) {
    ElMessage.error(error?.message || '导出二维码图版失败');
  } finally {
    exportBusy.value = false;
  }
}
'''
        png_new = '''async function exportSelectedQrPng() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  try {
    exportBusy.value = true;
    if (!isAdmin.value) {
      await exportSelectedQrPngLocal();
      return;
    }
    const ids = selectedRows.value.map((row) => Number(row.id));
    const result: any = await apiPost('/api/jobs', { job_type: 'PC_QR_SHEET_EXPORT', request_json: { ids, origin: window.location.origin }, retain_days: 7, max_retries: 1 });
    const jobId = Number(result?.data?.id || result?.id || 0);
    ElMessage.success(jobId ? `任务已创建（#${jobId}），可在“系统工具 / 异步任务”下载二维码图版（SVG）` : '任务已创建，可在“系统工具 / 异步任务”下载二维码图版（SVG）');
  } catch (error: any) {
    ElMessage.error(error?.message || '导出二维码图版失败');
  } finally {
    exportBusy.value = false;
  }
}
'''
    else:
        png_old = '''async function exportSelectedQrPng() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  try {
    exportBusy.value = true;
    const qrLinks = await fetchBulkMonitorAssetQrLinks(selectedRows.value.map((row) => Number(row.id)));
    const qrLinkMap = new Map<number, string>(qrLinks.map((item: { id: number; url: string }) => [item.id, item.url] as [number, string]));
    const records: Array<{ title: string; subtitle?: string; meta: Array<{ label: string; value: string }>; url: string }> = [];
    for (const row of selectedRows.value) {
      const link = qrLinkMap.get(Number(row.id)) || '';
      if (!link) continue;
      records.push({
        title: row.asset_code || `显示器 #${row.id}`,
        subtitle: [row.brand, row.model].filter(Boolean).join(' · ') || `SN：${row.sn || '-'}`,
        meta: [
          { label: '状态', value: assetStatusText(row.status) },
          { label: '位置', value: locationText(row) },
          { label: '领用人', value: row.employee_name || '-' },
          { label: '归档', value: Number(row.archived || 0) === 1 ? '已归档' : '在用' },
        ],
        url: link,
      });
    }
    if (!records.length) return ElMessage.warning('当前选中项没有可导出的二维码');
    const { downloadQrCardsPng } = await loadQrCardUtils();
    await downloadQrCardsPng(`显示器二维码图版_${records.length}条`, '显示器二维码图版', records);
    ElMessage.success('二维码图版(PNG)已导出');
  } catch (error: any) {
    ElMessage.error(error?.message || '导出二维码图版失败');
  } finally {
    exportBusy.value = false;
  }
}
'''
        png_new = '''async function exportSelectedQrPng() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  try {
    exportBusy.value = true;
    if (!isAdmin.value) {
      await exportSelectedQrPngLocal();
      return;
    }
    const ids = selectedRows.value.map((row) => Number(row.id));
    const result: any = await apiPost('/api/jobs', { job_type: 'MONITOR_QR_SHEET_EXPORT', request_json: { ids, origin: window.location.origin }, retain_days: 7, max_retries: 1 });
    const jobId = Number(result?.data?.id || result?.id || 0);
    ElMessage.success(jobId ? `任务已创建（#${jobId}），可在“系统工具 / 异步任务”下载二维码图版（SVG）` : '任务已创建，可在“系统工具 / 异步任务”下载二维码图版（SVG）');
  } catch (error: any) {
    ElMessage.error(error?.message || '导出二维码图版失败');
  } finally {
    exportBusy.value = false;
  }
}
'''
    text = text.replace(png_old, png_new)
    p.write_text(text)
    print('patched', path_str)

patch_file('/tmp/invnext/src/views/PcAssets.vue', 'pc', 'pc')
patch_file('/tmp/invnext/src/views/MonitorAssets.vue', 'monitor', 'monitor')
