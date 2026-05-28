import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { ElMessage } from '../utils/el-message';

export interface AssetSelectionSummary {
  total: number;
  archived: number;
  [key: string]: number;
}

export interface BulkDialogOptions<T = any> {
  /** 资产类型标签 */
  assetLabel: string;
  /** 选中数量 */
  selectedCount: ComputedRef<number>;
  /** 选中行 */
  selectedRows: Ref<T[]>;
  /** 选择摘要 */
  selectionSummary: ComputedRef<AssetSelectionSummary>;
  /** 批量操作忙碌状态 */
  batchBusy: Ref<boolean>;
  /** 清除选择 */
  clearSelection: () => void;
  /** 运行批量操作 */
  runBulkAction: (options: any) => Promise<void>;
  /** 运行批量删除 */
  runBulkDelete: (options: any) => Promise<void>;
  /** 归档原因选项 */
  archiveReasonOptions: Ref<string[]>;
  /** 默认归档原因 */
  defaultArchiveReason?: string;
  /** 确认批量风险 */
  confirmBatchRisk: (title: string, message: string) => Promise<void>;
  /** 应用状态补丁 */
  applyStatusPatch: (ids: number[], status: string) => void;
  /** 应用领用人补丁 */
  applyOwnerPatch: (ids: number[], payload: any) => void;
  /** 应用归档补丁 */
  applyArchivePatch: (ids: number[], payload: any) => void;
  /** 应用恢复补丁 */
  applyRestorePatch: (ids: number[]) => void;
  /** 应用删除补丁 */
  applyDeletePatch: (items: any[]) => void;
  /** 提取受影响的 ID */
  extractAffectedIds: (result: any, fallback?: number[]) => number[];
}

/**
 * 资产批量操作对话框 composable
 * 管理批量状态、领用人、归档等对话框的状态和提交逻辑
 */
export function useAssetBulkDialogs<T = any>(options: BulkDialogOptions<T>) {
  const {
    assetLabel,
    selectedCount,
    selectedRows,
    selectionSummary,
    batchBusy,
    clearSelection,
    runBulkAction,
    runBulkDelete,
    archiveReasonOptions,
    defaultArchiveReason = '停用归档',
    confirmBatchRisk,
    applyStatusPatch,
    applyOwnerPatch,
    applyArchivePatch,
    applyRestorePatch,
    applyDeletePatch,
    extractAffectedIds,
  } = options;

  // 对话框可见性状态
  const batchStatusVisible = ref(false);
  const batchOwnerVisible = ref(false);
  const batchArchiveVisible = ref(false);

  // 对话框表单数据
  const batchStatusValue = ref('IN_STOCK');
  const batchOwnerForm = ref({ employee_name: '', employee_no: '', department: '' });
  const batchArchiveForm = ref({ reason: defaultArchiveReason, note: '' });

  // 懒加载对话框标记
  const lazyBatchStatusDialog = ref(false);
  const lazyBatchOwnerDialog = ref(false);
  const lazyBatchArchiveDialog = ref(false);

  // 预览计算
  const batchStatusPreview = computed(() => {
    const { total, archived } = selectionSummary.value;
    let sameStatus = 0;
    for (const row of selectedRows.value) {
      if (Number((row as any).archived || 0) !== 1 && String((row as any).status || '') === String(batchStatusValue.value || '')) {
        sameStatus += 1;
      }
    }
    return { total, archived, sameStatus, eligible: Math.max(0, total - archived - sameStatus) };
  });

  const batchOwnerPreview = computed(() => {
    const { total, archived } = selectionSummary.value;
    let unassigned = 0;
    let sameOwner = 0;
    for (const row of selectedRows.value) {
      const r = row as any;
      if (Number(r.archived || 0) === 1) continue;
      if (String(r.status || '') !== 'ASSIGNED') {
        unassigned += 1;
        continue;
      }
      const name = String(r.last_employee_name || r.employee_name || '').trim();
      const no = String(r.last_employee_no || r.employee_no || '').trim();
      const dept = String(r.last_department || r.department || '').trim();
      const nextDept = String(batchOwnerForm.value.department || '').trim();
      if (
        name === String(batchOwnerForm.value.employee_name || '').trim() &&
        no === String(batchOwnerForm.value.employee_no || '').trim() &&
        (!nextDept || dept === nextDept)
      ) {
        sameOwner += 1;
      }
    }
    return { total, archived, unassigned, sameOwner, eligible: Math.max(0, total - archived - unassigned - sameOwner) };
  });

  const batchArchivePreview = computed(() => {
    const { total, archived } = selectionSummary.value;
    return { total, archived, eligible: Math.max(0, total - archived) };
  });

  // 对话框操作函数
  function warmLazyDialog(dialog: { value: boolean }) {
    if (!dialog.value) dialog.value = true;
  }

  function openBatchStatusDialog() {
    if (!selectedCount.value) return ElMessage.warning(`请先勾选${assetLabel}`);
    batchStatusValue.value = 'IN_STOCK';
    warmLazyDialog(lazyBatchStatusDialog);
    batchStatusVisible.value = true;
  }

  function openBatchOwnerDialog() {
    if (!selectedCount.value) return ElMessage.warning(`请先勾选${assetLabel}`);
    batchOwnerForm.value = { employee_name: '', employee_no: '', department: '' };
    warmLazyDialog(lazyBatchOwnerDialog);
    batchOwnerVisible.value = true;
  }

  function openBatchArchiveDialog(defaultReason?: string) {
    if (!selectedCount.value) return ElMessage.warning(`请先勾选${assetLabel}`);
    batchArchiveForm.value = {
      reason: defaultReason || archiveReasonOptions.value[0] || defaultArchiveReason,
      note: '',
    };
    warmLazyDialog(lazyBatchArchiveDialog);
    batchArchiveVisible.value = true;
  }

  // 提交函数
  async function submitBatchStatus() {
    if (!selectedCount.value) return ElMessage.warning(`请先勾选${assetLabel}`);
    await runBulkAction({
      action: 'status',
      payload: { status: batchStatusValue.value },
      successMessage: '批量修改成功',
      notificationTitle: '批量状态已更新',
      notificationMessage: `已处理 ${selectedCount.value} 个${assetLabel}的状态。`,
      errorMessage: '批量修改状态失败',
      closeDialog: () => { batchStatusVisible.value = false; },
      applyResult: (result: any) => applyStatusPatch(extractAffectedIds(result), batchStatusValue.value),
    });
  }

  async function submitBatchOwner() {
    if (!selectedCount.value) return ElMessage.warning(`请先勾选${assetLabel}`);
    if (!String(batchOwnerForm.value.employee_name || '').trim()) {
      return ElMessage.warning('请输入领用人');
    }
    await runBulkAction({
      action: 'owner',
      payload: {
        employee_name: batchOwnerForm.value.employee_name,
        employee_no: batchOwnerForm.value.employee_no,
        department: batchOwnerForm.value.department,
      },
      successMessage: '批量修改领用人成功',
      notificationTitle: '批量领用人已更新',
      notificationMessage: `已处理 ${selectedCount.value} 个${assetLabel}的领用信息。`,
      errorMessage: '批量修改领用人失败',
      closeDialog: () => { batchOwnerVisible.value = false; },
      applyResult: (result: any) => applyOwnerPatch(extractAffectedIds(result), batchOwnerForm.value),
    });
  }

  async function submitBatchArchive() {
    if (!selectedCount.value) return ElMessage.warning(`请先勾选${assetLabel}`);
    if (!String(batchArchiveForm.value.reason || '').trim()) {
      return ElMessage.warning('请选择归档原因');
    }
    try {
      await confirmBatchRisk(
        '批量归档确认',
        `此操作会归档选中的 ${selectedCount.value} 个${assetLabel}，归档后默认列表不再显示。`
      );
    } catch {
      return;
    }
    await runBulkAction({
      action: 'archive',
      payload: {
        reason: batchArchiveForm.value.reason,
        note: batchArchiveForm.value.note,
      },
      successMessage: '批量归档成功',
      notificationTitle: '批量归档完成',
      notificationMessage: `已归档 ${selectedCount.value} 个${assetLabel}。`,
      notificationType: 'warning',
      errorMessage: '批量归档失败',
      closeDialog: () => { batchArchiveVisible.value = false; },
      stable: true,
      applyResult: (result: any) => applyArchivePatch(extractAffectedIds(result), batchArchiveForm.value),
    });
  }

  async function batchRestoreSelected() {
    if (!selectedCount.value) return ElMessage.warning(`请先勾选${assetLabel}`);
    const restorable = selectionSummary.value.archived;
    if (!restorable) return ElMessage.warning(`当前选中项中没有已归档${assetLabel}`);
    try {
      await confirmBatchRisk(
        '批量恢复',
        `将恢复 ${restorable} 个已归档${assetLabel}，恢复后会重新出现在默认台账列表中。`
      );
    } catch {
      return;
    }
    await runBulkAction({
      action: 'restore',
      requestLabel: `正在批量恢复${assetLabel}归档`,
      successMessage: '批量恢复成功',
      notificationTitle: '批量恢复完成',
      notificationMessage: `已恢复 ${selectedCount.value} 个${assetLabel}。`,
      notificationType: 'info',
      errorMessage: '批量恢复失败',
      stable: true,
      applyResult: (result: any) => applyRestorePatch(extractAffectedIds(result)),
    });
  }

  async function batchDeleteSelected() {
    if (!selectedCount.value) return ElMessage.warning(`请先勾选${assetLabel}`);
    await runBulkDelete({
      requestLabel: `${assetLabel}批量删除`,
      errorMessage: '批量删除失败',
      applyDeletePatch,
    });
  }

  return {
    // 状态
    batchStatusVisible,
    batchOwnerVisible,
    batchArchiveVisible,
    batchStatusValue,
    batchOwnerForm,
    batchArchiveForm,
    lazyBatchStatusDialog,
    lazyBatchOwnerDialog,
    lazyBatchArchiveDialog,

    // 预览
    batchStatusPreview,
    batchOwnerPreview,
    batchArchivePreview,

    // 操作
    openBatchStatusDialog,
    openBatchOwnerDialog,
    openBatchArchiveDialog,
    submitBatchStatus,
    submitBatchOwner,
    submitBatchArchive,
    batchRestoreSelected,
    batchDeleteSelected,
    warmLazyDialog,
  };
}
