import { ref, type Ref } from 'vue';
import { ElMessage } from '../utils/el-message';

export interface AssetImportExportOptions {
  /** 资产类型标识 */
  assetType: 'pc' | 'monitor';
  /** 资产标签 */
  assetLabel: string;
  /** 导出忙碌状态 */
  exportBusy: Ref<boolean>;
  /** 导入忙碌状态 */
  importBusy: Ref<boolean>;
  /** 加载 Excel 工具 */
  loadExcelUtils: () => Promise<typeof import('../utils/excel')>;
  /** 获取当前筛选条件 */
  currentFiltersForList: () => any;
  /** 获取所有数据 */
  fetchAll: (filters: any, pageSize?: number) => Promise<any[]>;
  /** 刷新当前页面 */
  refreshCurrent: (resetPage?: boolean, force?: boolean) => Promise<void>;
  /** 资产状态文本函数 */
  assetStatusText: (status: string) => string;
  /** 格式化北京时间 */
  formatBeijingDateTime?: (date: string) => string;
  /** 位置文本函数（显示器用） */
  locationText?: (row: any) => string;
  /** 批量入库 API */
  batchImportApi: (items: any[]) => Promise<any>;
  /** 验证导入数据 */
  validateImportData?: (items: any[]) => { valid: boolean; errors?: string[] };
}

/**
 * 资产导入导出 composable
 * 处理 Excel 导入导出和模板下载功能
 */
export function useAssetImportExport(options: AssetImportExportOptions) {
  const {
    assetType,
    assetLabel,
    exportBusy,
    importBusy,
    loadExcelUtils,
    currentFiltersForList,
    fetchAll,
    refreshCurrent,
    assetStatusText,
    formatBeijingDateTime,
    locationText,
    batchImportApi,
    validateImportData,
  } = options;

  let excelUtilsPromise: Promise<typeof import('../utils/excel')> | null = null;
  let exportActionsPromise: Promise<any> | null = null;

  function loadExcelUtilsCached() {
    excelUtilsPromise ||= loadExcelUtils();
    return excelUtilsPromise;
  }

  function loadExportActions() {
    if (assetType === 'pc') {
      exportActionsPromise ||= import('../views/assets/assetLedgerExportActions');
    } else {
      exportActionsPromise ||= import('../views/assets/assetLedgerExportActions');
    }
    return exportActionsPromise;
  }

  /**
   * 导出选中行
   */
  async function exportSelectedRows(selectedRows: any[]) {
    if (!selectedRows.length) return ElMessage.warning(`请先勾选要导出的${assetLabel}`);
    try {
      exportBusy.value = true;
      const actions = await loadExportActions();
      if (assetType === 'pc') {
        await actions.exportPcSelectedRows({
          rows: selectedRows,
          loadExcelUtils: loadExcelUtilsCached,
          assetStatusText,
          formatBeijingDateTime,
        });
      } else {
        await actions.exportMonitorSelectedRows({
          rows: selectedRows,
          loadExcelUtils: loadExcelUtilsCached,
          assetStatusText,
          locationText,
        });
      }
    } catch (error: any) {
      ElMessage.error(error?.message || '导出失败');
    } finally {
      exportBusy.value = false;
    }
  }

  /**
   * 导出所有数据
   */
  async function exportExcel(total: number) {
    if (exportBusy.value) return;
    try {
      exportBusy.value = true;
      if (total > 1000) ElMessage.info('数据量较大，正在分批导出，请稍候…');
      const pageSize = total > 2000 ? 300 : 200;
      const all = await fetchAll(currentFiltersForList(), pageSize);
      const actions = await loadExportActions();
      if (assetType === 'pc') {
        await actions.exportPcAllRows({
          rows: all,
          loadExcelUtils: loadExcelUtilsCached,
          assetStatusText,
          formatBeijingDateTime,
        });
      } else {
        await actions.exportMonitorAllRows({
          rows: all,
          loadExcelUtils: loadExcelUtilsCached,
          assetStatusText,
          locationText,
        });
      }
    } catch (error: any) {
      ElMessage.error(error?.message || '导出失败');
    } finally {
      exportBusy.value = false;
    }
  }

  /**
   * 导出归档记录
   */
  async function exportArchiveRecords() {
    if (exportBusy.value) return;
    try {
      exportBusy.value = true;
      const filters = { ...currentFiltersForList(), showArchived: true };
      const all = await fetchAll(filters, 200);
      const rowsToExport = all.filter((row: any) => Number(row.archived || 0) === 1);
      if (!rowsToExport.length) return ElMessage.warning(`当前没有可导出的归档${assetLabel}记录`);
      const actions = await loadExportActions();
      if (assetType === 'pc') {
        await actions.exportPcArchiveRows({
          rows: rowsToExport,
          loadExcelUtils: loadExcelUtilsCached,
          assetStatusText,
          formatBeijingDateTime,
        });
      } else {
        await actions.exportMonitorArchiveRows({
          rows: rowsToExport,
          loadExcelUtils: loadExcelUtilsCached,
          assetStatusText,
          locationText,
          formatBeijingDateTime,
        });
      }
    } catch (error: any) {
      ElMessage.error(error?.message || '导出归档记录失败');
    } finally {
      exportBusy.value = false;
    }
  }

  /**
   * 下载导入模板
   */
  async function downloadTemplate(templateConfig: {
    filename: string;
    headers: Array<{ title: string }>;
    exampleRows: any[];
  }) {
    const { downloadTemplate: downloadFn } = await loadExcelUtilsCached();
    downloadFn(templateConfig);
  }

  /**
   * 处理导入文件
   */
  async function onImportFile(
    uploadFile: any,
    parseRowFn: (row: any) => any,
    options?: {
      requiredFields?: string[];
      fieldValidators?: Array<{ field: string; validate: (value: string) => boolean; message: string }>;
    }
  ) {
    if (importBusy.value) return;
    const file: File = uploadFile?.raw;
    if (!file) return;

    try {
      importBusy.value = true;
      const { parseXlsx } = await loadExcelUtilsCached();
      const excelRows = await parseXlsx(file);
      if (!excelRows.length) return ElMessage.warning('Excel里没有可导入的数据');

      const items = excelRows
        .map((row: any) => parseRowFn(row))
        .filter((item: any) => {
          // 过滤空行
          return Object.values(item).some((v) => String(v || '').trim());
        });

      if (!items.length) return ElMessage.warning('Excel里没有可导入的数据');

      // 验证必填字段
      if (options?.requiredFields) {
        for (const field of options.requiredFields) {
          const missingRows = items
            .map((item: any, index: number) => ({ index, value: String(item[field] || '').trim() }))
            .filter((entry) => !entry.value)
            .slice(0, 15)
            .map((entry) => entry.index + 2);

          if (missingRows.length) {
            return ElMessage.warning(`${field}必填，缺失行号：${missingRows.join(', ')}${missingRows.length >= 15 ? ' …' : ''}`);
          }
        }
      }

      // 自定义验证
      if (options?.fieldValidators) {
        for (const validator of options.fieldValidators) {
          const invalidRows = items
            .map((item: any, index: number) => ({
              index,
              value: String(item[validator.field] || '').trim(),
            }))
            .filter((entry) => entry.value && !validator.validate(entry.value))
            .slice(0, 15)
            .map((entry) => entry.index + 2);

          if (invalidRows.length) {
            return ElMessage.warning(`${validator.message}，问题行号：${invalidRows.join(', ')}${invalidRows.length >= 15 ? ' …' : ''}`);
          }
        }
      }

      // 自定义数据验证
      if (validateImportData) {
        const validation = validateImportData(items);
        if (!validation.valid) {
          return ElMessage.warning(validation.errors?.[0] || '数据验证失败');
        }
      }

      const result = await batchImportApi(items);
      const failed = Number(result?.failed || 0);
      if (failed > 0) {
        ElMessage.warning(`导入完成：成功 ${result.success} 条，失败 ${failed} 条（请查看控制台/接口返回 errors）`);
        console.warn(`${assetType}-batch errors`, result?.errors);
      } else {
        ElMessage.success(`导入完成：成功 ${result.success} 条`);
      }
      await refreshCurrent(true, true);
    } catch (error: any) {
      ElMessage.error(error?.message || '导入失败');
    } finally {
      importBusy.value = false;
    }
  }

  return {
    exportSelectedRows,
    exportExcel,
    exportArchiveRecords,
    downloadTemplate,
    onImportFile,
    loadExcelUtilsCached,
  };
}
