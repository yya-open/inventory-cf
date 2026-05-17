import { reactive, ref, type Ref } from 'vue';
import type { MonitorAsset } from '../types/assets';
import { apiPost, apiPut } from '../api/client';
import { trimText, useAssetFormActions, validateRequiredFields } from './useAssetFormActions';
import { ElMessage } from '../utils/el-services';

export type MonitorAssetFormState = {
  id: number;
  asset_code: string;
  sn: string;
  brand: string;
  model: string;
  size_inch: string;
  remark: string;
  location_id: number | string;
};

export type UseMonitorAssetFormOptions = {
  ensureLocationOptionsReady: () => Promise<void> | void;
  monitorBrandOptions: Readonly<Ref<string[]>>;
  refreshMonitorBrandOptions: (force?: boolean) => Promise<void> | void;
  handleMaybeMissingSchema: (error: unknown) => Promise<void> | void;
  systemSettings: Ref<{ ui_write_local_refresh?: boolean; [key: string]: any }>;
  refreshCurrent: (...args: any[]) => Promise<void>;
  patchCurrentRows: (ids: number[], updater: (row: MonitorAsset) => MonitorAsset) => void;
  findLocationParts: (locationId: number) => { location_name: string; parent_location_name: string };
  ensureLocalPatchedPageStable: (...args: any[]) => Promise<void>;
};

const SIZE_PATTERN = /^\d+(\.\d{1,2})?(\s*(寸|英寸))?$/;

function emptyForm(): MonitorAssetFormState {
  return { id: 0, asset_code: '', sn: '', brand: '', model: '', size_inch: '', remark: '', location_id: '' };
}

export function useMonitorAssetForm(options: UseMonitorAssetFormOptions) {
  const lazyAssetDialog = ref(false);
  const assetSaving = ref(false);
  const { runSaveAction } = useAssetFormActions();

  const dlgAsset = reactive({
    show: false,
    mode: 'create' as 'create' | 'edit',
    form: emptyForm(),
  });

  function warmLazyDialog() {
    if (!lazyAssetDialog.value) lazyAssetDialog.value = true;
  }

  function closeAssetDialog() {
    if (assetSaving.value) return;
    dlgAsset.show = false;
  }

  async function openCreate() {
    await options.ensureLocationOptionsReady();
    if (!options.monitorBrandOptions.value.length) void options.refreshMonitorBrandOptions(true);
    dlgAsset.mode = 'create';
    dlgAsset.form = emptyForm();
    warmLazyDialog();
    dlgAsset.show = true;
  }

  async function openEdit(row: MonitorAsset) {
    await options.ensureLocationOptionsReady();
    if (!options.monitorBrandOptions.value.length) void options.refreshMonitorBrandOptions(true);
    dlgAsset.mode = 'edit';
    dlgAsset.form = {
      id: Number(row.id) || 0,
      asset_code: row.asset_code || '',
      sn: row.sn || '',
      brand: row.brand || '',
      model: row.model || '',
      size_inch: row.size_inch || '',
      remark: row.remark || '',
      location_id: row.location_id || '',
    };
    warmLazyDialog();
    dlgAsset.show = true;
  }

  async function saveAsset() {
    await runSaveAction<Record<string, any>>({
      busy: assetSaving,
      buildPayload: () => ({
        ...dlgAsset.form,
        asset_code: trimText(dlgAsset.form.asset_code),
        sn: trimText(dlgAsset.form.sn),
        brand: trimText(dlgAsset.form.brand),
        model: trimText(dlgAsset.form.model),
        size_inch: trimText(dlgAsset.form.size_inch),
        remark: trimText(dlgAsset.form.remark),
        location_id: dlgAsset.form.location_id || '',
      }),
      validate: (payload) => {
        if (!validateRequiredFields(payload, [
          { key: 'asset_code', label: '资产编号' },
          { key: 'brand', label: '品牌' },
          { key: 'model', label: '型号' },
        ])) return false;
        if (payload.size_inch && !SIZE_PATTERN.test(payload.size_inch)) {
          ElMessage.warning('尺寸请填写数字或“27寸”这类格式');
          return false;
        }
        return true;
      },
      submit: (payload) => {
        dlgAsset.form = { ...(payload as any) };
        return dlgAsset.mode === 'create'
          ? apiPost('/api/monitor-assets', payload)
          : apiPut('/api/monitor-assets', payload);
      },
      recoverBeforeRetry: options.handleMaybeMissingSchema,
      successMessage: dlgAsset.mode === 'create' ? '新增成功' : '保存成功',
      notificationTitle: dlgAsset.mode === 'create' ? '显示器已新增' : '显示器已更新',
      notificationMessage: (payload) => dlgAsset.mode === 'create'
        ? `已创建 ${payload.asset_code || '新显示器'}。`
        : `已更新 ${payload.asset_code || '显示器记录'}。`,
      errorMessage: '操作失败',
      onSuccess: async (payload) => {
        dlgAsset.show = false;
        if (dlgAsset.mode === 'create') {
          await options.refreshCurrent(true, true);
          return;
        }
        if (options.systemSettings.value.ui_write_local_refresh) {
          options.patchCurrentRows([Number(payload.id)], (row) => ({
            ...row,
            asset_code: payload.asset_code,
            sn: payload.sn,
            brand: payload.brand,
            model: payload.model,
            size_inch: payload.size_inch || '',
            remark: payload.remark || '',
            location_id: payload.location_id || null,
            ...options.findLocationParts(Number(payload.location_id || 0) || 0),
          }));
          await options.ensureLocalPatchedPageStable(false);
        } else {
          await options.refreshCurrent(true, true);
        }
      },
    });
  }

  return {
    dlgAsset,
    assetSaving,
    lazyAssetDialog,
    openCreate,
    openEdit,
    closeAssetDialog,
    saveAsset,
  };
}
