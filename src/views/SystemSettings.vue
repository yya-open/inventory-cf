<template>
  <div class="settings-page">
    <el-card class="settings-card">
      <template #header>
        <div class="settings-header">
          <div>
            <div class="settings-title">系统配置</div>
            <div class="settings-subtitle">把默认规则、可维护字典和盘点体验统一收口，修改后即时影响台账与扫码体验。</div>
          </div>
          <div class="settings-actions">
            <el-button @click="reload" :loading="loading">刷新</el-button>
            <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
          </div>
        </div>
      </template>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="品牌 / 部门 / 归档原因已升级为独立字典表，支持启停、排序和引用统计；禁用后不再出现在下拉建议中，已有历史数据仍会保留。"
      />

      <div class="settings-summary">
        <div class="summary-item">
          <div class="summary-label">默认分页</div>
          <div class="summary-value">{{ form.ui_default_page_size }}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">物理删除</div>
          <div class="summary-value">{{ form.asset_allow_physical_delete ? '允许' : '优先归档' }}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">归档原因</div>
          <div class="summary-value">{{ activeCount('asset_archive_reason') }}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">部门字典</div>
          <div class="summary-value">{{ activeCount('department') }}</div>
        </div>
      </div>

      <el-row :gutter="14" class="settings-grid">
        <el-col :xs="24" :lg="12">
          <el-card shadow="never" class="section-card">
            <template #header><div class="section-title">通用前端默认值</div></template>
            <el-form label-width="140px">
              <el-form-item label="默认每页条数">
                <el-input-number v-model="form.ui_default_page_size" :min="10" :max="200" :step="10" />
                <div class="form-tip">台账页未记住个人页大小时，会使用这里的默认值。</div>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
        <el-col :xs="24" :lg="12">
          <el-card shadow="never" class="section-card">
            <template #header><div class="section-title">归档策略</div></template>
            <el-form label-width="160px">
              <el-form-item label="允许物理删除">
                <el-switch v-model="form.asset_allow_physical_delete" />
                <div class="form-tip">关闭后，删除资产将优先转为归档，更适合正式环境保留追溯链路。</div>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
        <el-col :xs="24" :lg="12">
          <el-card shadow="never" class="section-card">
            <template #header><div class="section-title">扫码与现场盘点体验</div></template>
            <el-form label-width="170px">
              <el-form-item label="扫码提交冷却秒数">
                <el-input-number v-model="form.public_inventory_cooldown_seconds" :min="5" :max="120" />
                <div class="form-tip">现场连续扫码时，防止同一项被短时间重复提交。</div>
              </el-form-item>
              <el-form-item label="扫码成功自动震动">
                <el-switch v-model="form.public_inventory_auto_vibrate" />
              </el-form-item>
              <el-form-item label="默认连续盘点模式">
                <el-switch v-model="form.public_inventory_continuous_mode_default" />
              </el-form-item>
              <el-form-item label="默认移动端紧凑布局">
                <el-switch v-model="form.public_inventory_mobile_compact" />
              </el-form-item>
              <el-form-item label="弱网重试提示">
                <el-switch v-model="form.public_inventory_retry_hint" />
              </el-form-item>
              <el-form-item label="默认连续扫码方式">
                <el-segmented v-model="form.public_inventory_scan_mode_default" :options="scanModeOptions" class="scan-mode-setting" />
                <div class="form-tip">可选手动、扫码枪或摄像头连续扫码。摄像头模式更适合手机现场盘点。</div>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
        <el-col :xs="24" :lg="12">
          <el-card shadow="never" class="section-card section-card--dictionary-overview">
            <template #header><div class="section-title">字典维护说明</div></template>
            <div class="dictionary-overview">
              <div>启用：会出现在对应页面的下拉建议中。</div>
              <div>停用：不再提供新选择，但不会影响历史记录展示。</div>
              <div>排序：数字越小越靠前，也可直接用上下按钮微调。</div>
              <div>引用统计：用于判断是否还在被台账数据使用。</div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <div class="dictionary-sections">
        <el-card v-for="def in dictionaryDefs" :key="def.key" shadow="never" class="section-card dictionary-card">
          <template #header>
            <div class="dictionary-card-header">
              <div>
                <div class="section-title">{{ def.title }}</div>
                <div class="dictionary-subtitle">{{ def.description }}</div>
              </div>
              <div class="dictionary-card-actions">
                <el-tag type="info">启用 {{ activeCount(def.key) }}</el-tag>
                <el-tag type="success">总计 {{ dictionaryRows(def.key).length }}</el-tag>
                <el-button type="primary" @click="openCreateDialog(def.key)">新增</el-button>
              </div>
            </div>
          </template>

          <el-table :data="dictionaryRows(def.key)" border stripe class="dictionary-table" empty-text="暂无字典项">
            <el-table-column label="字典值" min-width="220">
              <template #default="{ row }">
                <el-input v-model="row.label" maxlength="120" placeholder="请输入字典值" />
              </template>
            </el-table-column>
            <el-table-column label="排序" width="110" align="center">
              <template #default="{ row }">
                <el-input-number v-model="row.sort_order" :min="0" :max="999999" controls-position="right" style="width:100%" />
              </template>
            </el-table-column>
            <el-table-column label="启用" width="90" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" :active-value="1" :inactive-value="0" />
              </template>
            </el-table-column>
            <el-table-column label="引用" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.reference_count ? 'warning' : 'info'">{{ row.reference_count || 0 }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="更新" min-width="160">
              <template #default="{ row }">
                <div>{{ row.updated_at || '-' }}</div>
                <div class="table-subtle">{{ row.updated_by || '系统' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="220" fixed="right">
              <template #default="scope">
                <div class="row-actions">
                  <el-button link @click="moveRow(def.key, scope.$index, -1)" :disabled="scope.$index === 0 || rowBusy(scope.row.id)">上移</el-button>
                  <el-button link @click="moveRow(def.key, scope.$index, 1)" :disabled="scope.$index >= dictionaryRows(def.key).length - 1 || rowBusy(scope.row.id)">下移</el-button>
                  <el-button link type="primary" :loading="rowBusy(scope.row.id)" @click="saveDictionary(scope.row)">保存</el-button>
                  <el-button link type="danger" :disabled="Boolean(scope.row.reference_count) || rowBusy(scope.row.id)" @click="removeDictionary(scope.row)">删除</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>
    </el-card>

    <el-dialog v-model="createDialogVisible" title="新增字典项" width="440px">
      <el-form label-width="100px">
        <el-form-item label="所属字典">
          <el-select v-model="createForm.dictionary_key" style="width:100%">
            <el-option v-for="def in dictionaryDefs" :key="def.key" :label="def.title" :value="def.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="字典值">
          <el-input v-model="createForm.label" maxlength="120" placeholder="请输入字典值" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="createForm.sort_order" :min="0" :max="999999" style="width:100%" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="createForm.enabled" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">新增</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { DEFAULT_SYSTEM_SETTINGS, fetchSystemSettings, saveSystemSettings, type SystemSettings } from '../api/systemSettings';
import {
  createSystemDictionaryItem,
  deleteSystemDictionaryItem,
  fetchSystemDictionaries,
  updateSystemDictionaryItem,
  type SystemDictionaryItem,
  type SystemDictionaryKey,
} from '../api/systemDictionaries';

const loading = ref(false);
const saving = ref(false);
const creating = ref(false);
const createDialogVisible = ref(false);
const form = ref<SystemSettings>({ ...DEFAULT_SYSTEM_SETTINGS });
const rowLoadingMap = ref<Record<number, boolean>>({});
const dictionaries = ref<Record<SystemDictionaryKey, SystemDictionaryItem[]>>({
  asset_archive_reason: [],
  department: [],
  pc_brand: [],
  monitor_brand: [],
});
const scanModeOptions = [
  { label: '手动', value: 'manual' },
  { label: '扫码枪', value: 'scanner' },
  { label: '摄像头', value: 'camera' },
];
const dictionaryDefs: Array<{ key: SystemDictionaryKey; title: string; description: string }> = [
  { key: 'asset_archive_reason', title: '归档原因字典', description: '用于台账归档原因筛选和批量归档弹窗。' },
  { key: 'department', title: '部门字典', description: '用于电脑 / 显示器领用部门下拉建议。' },
  { key: 'pc_brand', title: '电脑品牌字典', description: '用于电脑台账新增、编辑与筛选时的品牌建议。' },
  { key: 'monitor_brand', title: '显示器品牌字典', description: '用于显示器台账新增、编辑与筛选时的品牌建议。' },
];
const createForm = ref<{ dictionary_key: SystemDictionaryKey; label: string; sort_order: number; enabled: 0 | 1 }>({
  dictionary_key: 'department',
  label: '',
  sort_order: 10,
  enabled: 1,
});

function normalizeGrouped(grouped?: Partial<Record<SystemDictionaryKey, SystemDictionaryItem[]>>) {
  return {
    asset_archive_reason: [...(grouped?.asset_archive_reason || [])],
    department: [...(grouped?.department || [])],
    pc_brand: [...(grouped?.pc_brand || [])],
    monitor_brand: [...(grouped?.monitor_brand || [])],
  } as Record<SystemDictionaryKey, SystemDictionaryItem[]>;
}

function rowBusy(id: number) {
  return Boolean(rowLoadingMap.value[id]);
}

function dictionaryRows(key: SystemDictionaryKey) {
  return dictionaries.value[key] || [];
}

function activeCount(key: SystemDictionaryKey) {
  return dictionaryRows(key).filter((item) => Number(item.enabled || 0) === 1).length;
}

function nextSortOrder(key: SystemDictionaryKey) {
  const list = dictionaryRows(key);
  if (!list.length) return 10;
  return Math.max(...list.map((item) => Number(item.sort_order || 0))) + 10;
}

function sortDictionaryList(list: SystemDictionaryItem[]) {
  return [...list].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id || 0) - Number(b.id || 0));
}

function syncFormDictionaryOptions() {
  form.value = {
    ...form.value,
    asset_archive_reason_options: sortDictionaryList(dictionaryRows('asset_archive_reason')).filter((item) => Number(item.enabled || 0) === 1).map((item) => String(item.label || '').trim()).filter(Boolean),
    dictionary_department_options: sortDictionaryList(dictionaryRows('department')).filter((item) => Number(item.enabled || 0) === 1).map((item) => String(item.label || '').trim()).filter(Boolean),
    dictionary_pc_brand_options: sortDictionaryList(dictionaryRows('pc_brand')).filter((item) => Number(item.enabled || 0) === 1).map((item) => String(item.label || '').trim()).filter(Boolean),
    dictionary_monitor_brand_options: sortDictionaryList(dictionaryRows('monitor_brand')).filter((item) => Number(item.enabled || 0) === 1).map((item) => String(item.label || '').trim()).filter(Boolean),
  };
}

async function loadSettingsOnly() {
  form.value = await fetchSystemSettings();
}

async function loadDictionariesOnly() {
  const data = await fetchSystemDictionaries();
  dictionaries.value = normalizeGrouped(data?.grouped);
  syncFormDictionaryOptions();
}

async function reload() {
  loading.value = true;
  try {
    await Promise.all([loadSettingsOnly(), loadDictionariesOnly()]);
  } catch (e: any) {
    ElMessage.error(e?.message || '加载配置失败');
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    form.value = await saveSystemSettings(form.value);
    ElMessage.success('配置已保存');
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function openCreateDialog(key: SystemDictionaryKey) {
  createForm.value = {
    dictionary_key: key,
    label: '',
    sort_order: nextSortOrder(key),
    enabled: 1,
  };
  createDialogVisible.value = true;
}

async function submitCreate() {
  const label = String(createForm.value.label || '').trim();
  if (!label) return ElMessage.warning('请输入字典值');
  creating.value = true;
  try {
    await createSystemDictionaryItem({
      dictionary_key: createForm.value.dictionary_key,
      label,
      sort_order: createForm.value.sort_order,
      enabled: createForm.value.enabled,
    });
    createDialogVisible.value = false;
    await Promise.all([loadDictionariesOnly(), loadSettingsOnly()]);
    ElMessage.success('字典项已新增');
  } catch (e: any) {
    ElMessage.error(e?.message || '新增失败');
  } finally {
    creating.value = false;
  }
}

async function saveDictionary(row: SystemDictionaryItem) {
  const label = String(row.label || '').trim();
  if (!label) return ElMessage.warning('字典值不能为空');
  rowLoadingMap.value = { ...rowLoadingMap.value, [row.id]: true };
  try {
    await updateSystemDictionaryItem({
      id: row.id,
      dictionary_key: row.dictionary_key,
      label,
      sort_order: row.sort_order,
      enabled: row.enabled,
    });
    await Promise.all([loadDictionariesOnly(), loadSettingsOnly()]);
    ElMessage.success('字典项已保存');
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    rowLoadingMap.value = { ...rowLoadingMap.value, [row.id]: false };
  }
}

async function moveRow(key: SystemDictionaryKey, index: number, delta: number) {
  const list = [...dictionaryRows(key)];
  const targetIndex = index + delta;
  if (targetIndex < 0 || targetIndex >= list.length) return;
  const current = list[index];
  const target = list[targetIndex];
  if (!current || !target) return;
  const currentSort = Number(current.sort_order || 0) || (index + 1) * 10;
  const targetSort = Number(target.sort_order || 0) || (targetIndex + 1) * 10;
  const previousList = list.map((item) => ({ ...item }));
  const nextList = list.map((item) => ({ ...item }));
  nextList[index] = { ...target, sort_order: currentSort };
  nextList[targetIndex] = { ...current, sort_order: targetSort };
  dictionaries.value = { ...dictionaries.value, [key]: sortDictionaryList(nextList) };
  syncFormDictionaryOptions();
  rowLoadingMap.value = { ...rowLoadingMap.value, [current.id]: true, [target.id]: true };
  try {
    await Promise.all([
      updateSystemDictionaryItem({ id: current.id, sort_order: targetSort, label: current.label, enabled: current.enabled, dictionary_key: current.dictionary_key }),
      updateSystemDictionaryItem({ id: target.id, sort_order: currentSort, label: target.label, enabled: target.enabled, dictionary_key: target.dictionary_key }),
    ]);
  } catch (e: any) {
    dictionaries.value = { ...dictionaries.value, [key]: previousList };
    syncFormDictionaryOptions();
    ElMessage.error(e?.message || '排序调整失败');
  } finally {
    rowLoadingMap.value = { ...rowLoadingMap.value, [current.id]: false, [target.id]: false };
  }
}

async function removeDictionary(row: SystemDictionaryItem) {
  await ElMessageBox.confirm(`确认删除字典项“${row.label}”？删除后不可恢复。`, '删除字典项', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  });
  rowLoadingMap.value = { ...rowLoadingMap.value, [row.id]: true };
  try {
    await deleteSystemDictionaryItem(row.id);
    await Promise.all([loadDictionariesOnly(), loadSettingsOnly()]);
    ElMessage.success('字典项已删除');
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败');
  } finally {
    rowLoadingMap.value = { ...rowLoadingMap.value, [row.id]: false };
  }
}

onMounted(reload);
</script>

<style scoped>
.settings-page{max-width:1280px;margin:0 auto}
.settings-card,.section-card{border-radius:16px}
.settings-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.settings-title{font-weight:800;font-size:18px}
.settings-subtitle{color:#777;font-size:13px;margin-top:4px}
.settings-actions{display:flex;gap:10px;flex-wrap:wrap}
.settings-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:14px 0 4px}
.summary-item{padding:14px 16px;border:1px solid #ebeef5;border-radius:14px;background:linear-gradient(180deg,#fff 0%,#fafcff 100%)}
.summary-label{font-size:12px;color:#909399;margin-bottom:6px}
.summary-value{font-size:20px;font-weight:800;color:#303133}
.settings-grid{margin-top:14px}
.section-title{font-weight:700}
.form-tip{margin-top:6px;color:#8a8a8a;font-size:12px;line-height:1.5}
.scan-mode-setting{max-width:320px}
.section-card--dictionary-overview{height:100%}
.dictionary-overview{display:grid;gap:10px;color:#606266;line-height:1.7;font-size:13px}
.dictionary-sections{display:grid;gap:14px;margin-top:14px}
.dictionary-card-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.dictionary-subtitle{color:#8a8a8a;font-size:12px;margin-top:4px}
.dictionary-card-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dictionary-table :deep(.el-input-number){width:100%}
.row-actions{display:flex;align-items:center;gap:2px;flex-wrap:wrap}
.table-subtle{color:#909399;font-size:12px;margin-top:2px}
</style>
