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
        title="品牌、归档原因和仓域已升级为独立字典表，支持启停、排序和引用统计；禁用后不再出现在下拉建议中，已有历史数据仍会保留。部门改为自由输入，无需再维护部门字典。"
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
          <div class="summary-label">报废预警</div>
          <div class="summary-value">{{ form.pc_scrap_warning_years }} 年</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">归档原因</div>
          <div class="summary-value">{{ activeCount('asset_archive_reason') }}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">写入后刷新</div>
          <div class="summary-value">{{ form.ui_write_local_refresh ? '本地刷新' : '整页回拉' }}</div>
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
              <el-form-item label="写入后刷新策略">
                <el-switch v-model="form.ui_write_local_refresh" />
                <div class="form-tip">开启后，入库/出库成功会优先本地更新列表，减少一次整表刷新请求。</div>
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
              <el-form-item label="电脑报废预警年限">
                <el-select v-model="form.pc_scrap_warning_years" style="width:180px">
                  <el-option v-for="year in [1,2,3,4,5]" :key="year" :label="`${year} 年`" :value="year" />
                </el-select>
                <div class="form-tip">电脑仓“报废预警”页面会按这里的年限筛出超龄设备。</div>
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
              <el-form-item label="最近扫码数量">
                <el-input-number v-model="form.public_inventory_recent_targets_limit" :min="3" :max="20" />
                <div class="form-tip">扫码页顶部最近记录按钮数量，手机现场建议 5~8 条。</div>
              </el-form-item>
              <el-form-item label="摄像头模式自动启动">
                <el-switch v-model="form.public_inventory_camera_auto_start" />
              </el-form-item>
              <el-form-item label="扫码页显示更新时间">
                <el-switch v-model="form.public_asset_show_updated_at" />
                <div class="form-tip">开启后，公开扫码页会额外显示资料更新时间和二维码更新时间。</div>
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
              <div>排序：支持拖拽 / 上下微调，本地调整后统一保存。</div>
              <div>引用统计：用于判断是否还在被台账数据使用。</div>
            </div>
          </el-card>
        </el-col>
      
        <el-col :xs="24" :lg="12">
          <el-card shadow="never" class="section-card">
            <template #header><div class="section-title">数据质量与防错</div></template>
            <el-form label-width="170px">
              <el-form-item label="员工工号正则">
                <el-input v-model="form.validation_employee_no_pattern" placeholder="例如：^[A-Za-z0-9_-]{3,32}$" />
                <div class="form-tip">出库单和批量 Excel 会按这里校验员工工号格式。</div>
              </el-form-item>
              <el-form-item label="序列号自动大写">
                <el-switch v-model="form.validation_serial_no_uppercase" />
              </el-form-item>
              <el-form-item label="备注最大长度">
                <el-input-number v-model="form.validation_remark_max_length" :min="50" :max="2000" :step="50" />
                <div class="form-tip">导入和手工表单都会按这里自动裁剪备注长度。</div>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>

        <el-col :xs="24" :lg="12">
          <el-card shadow="never" class="section-card">
            <template #header><div class="section-title">二维码与标签默认策略</div></template>
            <el-form label-width="180px">
              <el-form-item label="系统默认打印机预设">
                <el-select v-model="form.qr_default_printer_profile">
                  <el-option v-for="item in printerProfileOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="电脑标签默认模板">
                <div class="setting-stack">
                  <el-select v-model="form.qr_default_pc_cards_label_preset"><el-option v-for="item in labelPresetOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
                  <el-select v-model="form.qr_default_pc_cards_content_mode"><el-option v-for="item in qrContentModeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
                </div>
              </el-form-item>
              <el-form-item label="电脑图版默认模板">
                <div class="setting-stack">
                  <el-select v-model="form.qr_default_pc_sheet_label_preset"><el-option v-for="item in labelPresetOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
                  <el-select v-model="form.qr_default_pc_sheet_content_mode"><el-option v-for="item in qrContentModeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
                </div>
              </el-form-item>
              <el-form-item label="显示器标签默认模板">
                <div class="setting-stack">
                  <el-select v-model="form.qr_default_monitor_cards_label_preset"><el-option v-for="item in labelPresetOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
                  <el-select v-model="form.qr_default_monitor_cards_content_mode"><el-option v-for="item in qrContentModeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
                </div>
              </el-form-item>
              <el-form-item label="显示器图版默认模板">
                <div class="setting-stack">
                  <el-select v-model="form.qr_default_monitor_sheet_label_preset"><el-option v-for="item in labelPresetOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
                  <el-select v-model="form.qr_default_monitor_sheet_content_mode"><el-option v-for="item in qrContentModeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
                </div>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>

        <el-col :xs="24" :lg="12">
          <el-card shadow="never" class="section-card">
            <template #header><div class="section-title">二维码内容策略与导出命名</div></template>
            <el-form label-width="180px">
              <el-form-item label="二维码内容策略">
                <el-select v-model="form.qr_content_strategy">
                  <el-option v-for="item in qrStrategyOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="公开访问基础地址">
                <el-input v-model="form.qr_public_base_url" placeholder="留空默认当前站点，如 https://asset.example.com" />
              </el-form-item>
              <el-form-item label="自定义二维码前缀">
                <el-input v-model="form.qr_custom_prefix" placeholder="仅在“自定义文本”策略下生效，例如 ASSET:" />
              </el-form-item>
              <el-form-item label="导出文件命名">
                <el-select v-model="form.export_qr_file_name_mode">
                  <el-option v-for="item in exportFileNameOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="ZIP 内页命名">
                <el-select v-model="form.export_qr_zip_entry_name_mode">
                  <el-option v-for="item in exportZipEntryOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>

        <el-col :xs="24" :lg="12">
          <el-card shadow="never" class="section-card">
            <template #header><div class="section-title">仓库默认规则与系统开关</div></template>
            <el-form label-width="180px">
              <el-form-item label="电脑仓默认标签">
                <el-input v-model="form.warehouse_default_pc_label" />
              </el-form-item>
              <el-form-item label="显示器仓默认标签">
                <el-input v-model="form.warehouse_default_monitor_label" />
              </el-form-item>
              <el-form-item label="默认归档原因">
                <el-select v-model="form.warehouse_default_archive_reason" allow-create filterable default-first-option>
                  <el-option v-for="item in form.asset_archive_reason_options" :key="item" :label="item" :value="item" />
                </el-select>
              </el-form-item>
              <el-form-item label="允许运行时 DDL">
                <el-switch v-model="form.ops_enable_runtime_ddl" />
                <div class="form-tip">仅用于应急自修复。生产环境建议关闭，优先使用迁移脚本和初始化工具。</div>
              </el-form-item>
            </el-form>
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
                <el-tag v-if="hasPendingReorder(def.key)" type="warning">排序待保存</el-tag>
                <el-button v-if="hasPendingReorder(def.key)" type="success" :loading="reorderBusy(def.key)" @click="saveDictionaryOrder(def.key)">保存排序</el-button>
                <el-button type="primary" @click="openCreateDialog(def.key)">新增</el-button>
              </div>
            </div>
          </template>

          <el-table :data="dictionaryRows(def.key)" border stripe class="dictionary-table" empty-text="暂无字典项" row-key="id">
            <el-table-column label="排序" width="110" align="center">
              <template #default="scope">
                <div
                  class="drag-cell"
                  :class="{ 'drag-cell--busy': reorderBusy(def.key), 'drag-cell--active': dragState.key === def.key && dragState.fromId === scope.row.id }"
                  :draggable="!reorderBusy(def.key)"
                  @dragstart="onDictionaryDragStart(def.key, scope.$index, scope.row.id)"
                  @dragover.prevent="onDictionaryDragOver"
                  @drop.prevent="onDictionaryDrop(def.key, scope.$index)"
                  @dragend="clearDictionaryDrag"
                >
                  <span class="drag-handle">☰</span>
                  <span class="drag-order">{{ scope.$index + 1 }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="字典值" min-width="220">
              <template #default="{ row }">
                <el-input v-model="row.label" maxlength="120" placeholder="请输入字典值" />
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
                  <el-button link @click="moveRow(def.key, scope.$index, -1)" :disabled="scope.$index === 0 || reorderBusy(def.key)">上移</el-button>
                  <el-button link @click="moveRow(def.key, scope.$index, 1)" :disabled="scope.$index >= dictionaryRows(def.key).length - 1 || reorderBusy(def.key)">下移</el-button>
                  <el-button link type="primary" :loading="rowBusy(scope.row.id, def.key)" @click="saveDictionary(scope.row)">保存</el-button>
                  <el-button link type="danger" :disabled="Boolean(scope.row.reference_count) || rowBusy(scope.row.id, def.key)" @click="removeDictionary(scope.row)">删除</el-button>
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
import { ElSegmented } from 'element-plus';
import { onMounted, ref } from 'vue';
import { scheduleOnIdle } from '../utils/idle';
import { ElMessage, ElMessageBox } from "../utils/el-services";
import { DEFAULT_SYSTEM_SETTINGS, fetchSystemSettings, saveSystemSettings, markMonitorBrandDictionaryChanged, type SystemSettings } from '../api/systemSettings';
import {
  createSystemDictionaryItem,
  deleteSystemDictionaryItem,
  fetchSystemDictionaries,
  reorderSystemDictionaryItems,
  updateSystemDictionaryItem,
  type SystemDictionaryItem,
  type SystemDictionaryKey,
} from '../api/systemDictionaries';

const loading = ref(false);
const dictionariesLoading = ref(false);
const saving = ref(false);
const creating = ref(false);
const createDialogVisible = ref(false);
const form = ref<SystemSettings>({ ...DEFAULT_SYSTEM_SETTINGS });
const rowLoadingMap = ref<Record<number, boolean>>({});
const reorderLoadingMap = ref<Record<SystemDictionaryKey, boolean>>({
  asset_archive_reason: false,
  pc_brand: false,
  monitor_brand: false,
  asset_warehouse: false,
});
const reorderDirtyMap = ref<Record<SystemDictionaryKey, boolean>>({
  asset_archive_reason: false,
  pc_brand: false,
  monitor_brand: false,
  asset_warehouse: false,
});
const dragState = ref<{ key: SystemDictionaryKey | null; fromIndex: number; fromId: number | null }>({
  key: null,
  fromIndex: -1,
  fromId: null,
});
const dictionaries = ref<Record<SystemDictionaryKey, SystemDictionaryItem[]>>({
  asset_archive_reason: [],
  pc_brand: [],
  monitor_brand: [],
  asset_warehouse: [],
});
const scanModeOptions = [
  { label: '手动', value: 'manual' },
  { label: '扫码枪', value: 'scanner' },
  { label: '摄像头', value: 'camera' },
];
const printerProfileOptions = [
  { label: '通用高精度 / 300 DPI', value: 'generic_300' },
  { label: '兄弟标签机 / 300 DPI', value: 'brother_300' },
  { label: '得力标签机 / 203 DPI', value: 'deli_203' },
  { label: '佳博 / 热敏 203 DPI', value: 'gprinter_203' },
];
const labelPresetOptions = [
  { label: '普通纸张', value: 'none' },
  { label: '40 × 30 mm', value: '40x30' },
  { label: '50 × 30 mm', value: '50x30' },
  { label: '60 × 40 mm', value: '60x40' },
  { label: '70 × 50 mm', value: '70x50' },
];
const qrContentModeOptions = [
  { label: '明细版', value: 'detail' },
  { label: '仅二维码', value: 'qr_only' },
  { label: '二维码+型号+SN', value: 'model_sn' },
  { label: '二维码+型号+资产编号', value: 'model_asset' },
];
const qrStrategyOptions = [
  { label: '公开详情链接（标准）', value: 'public_link' },
  { label: '短参数详情链接', value: 'short_query' },
  { label: '自定义文本内容', value: 'custom_text' },
];
const exportFileNameOptions = [
  { label: '简洁名称', value: 'simple' },
  { label: '带日期时间', value: 'date' },
  { label: '按设备+模板命名', value: 'scope_template' },
];
const exportZipEntryOptions = [
  { label: '按页码命名', value: 'page' },
  { label: '单资产优先命名', value: 'asset' },
];
const dictionaryDefs: Array<{ key: SystemDictionaryKey; title: string; description: string }> = [
  { key: 'asset_archive_reason', title: '归档原因字典', description: '用于台账归档原因筛选和批量归档弹窗。' },
  { key: 'pc_brand', title: '电脑品牌字典', description: '用于电脑台账新增、编辑与筛选时的品牌建议。' },
  { key: 'monitor_brand', title: '显示器品牌字典', description: '用于显示器台账新增、编辑与筛选时的品牌建议。' },
  { key: 'asset_warehouse', title: '资产仓域字典', description: '用于用户可见范围、看板口径与仓域治理配置。' },
];
const createForm = ref<{ dictionary_key: SystemDictionaryKey; label: string; sort_order: number; enabled: 0 | 1 }>({
  dictionary_key: 'pc_brand',
  label: '',
  sort_order: 10,
  enabled: 1,
});

function normalizeGrouped(grouped?: Partial<Record<SystemDictionaryKey, SystemDictionaryItem[]>>) {
  return {
    asset_archive_reason: [...(grouped?.asset_archive_reason || [])],
    pc_brand: [...(grouped?.pc_brand || [])],
    monitor_brand: [...(grouped?.monitor_brand || [])],
    asset_warehouse: [...(grouped?.asset_warehouse || [])],
  } as Record<SystemDictionaryKey, SystemDictionaryItem[]>;
}

function rowBusy(id: number, key?: SystemDictionaryKey) {
  return Boolean(rowLoadingMap.value[id]) || Boolean(key && reorderLoadingMap.value[key]);
}

function reorderBusy(key: SystemDictionaryKey) {
  return Boolean(reorderLoadingMap.value[key]);
}

function hasPendingReorder(key: SystemDictionaryKey) {
  return Boolean(reorderDirtyMap.value[key]);
}

function markReorderDirty(key: SystemDictionaryKey, value = true) {
  reorderDirtyMap.value = { ...reorderDirtyMap.value, [key]: value };
}

function dictionaryRows(key: SystemDictionaryKey) {
  return dictionaries.value[key] || [];
}

function replaceDictionaryRows(key: SystemDictionaryKey, rows: SystemDictionaryItem[], markDirty = false) {
  dictionaries.value = {
    ...dictionaries.value,
    [key]: sortDictionaryList(rows),
  };
  if (markDirty) markReorderDirty(key, true);
  syncFormDictionaryOptions();
}

function upsertDictionaryRow(row: SystemDictionaryItem) {
  const key = row.dictionary_key;
  const current = dictionaryRows(key);
  const next = current.some((item) => Number(item.id) === Number(row.id))
    ? current.map((item) => (Number(item.id) === Number(row.id) ? { ...item, ...row } : item))
    : [...current, row];
  replaceDictionaryRows(key, next, false);
}

function removeLocalDictionaryRow(row: Pick<SystemDictionaryItem, 'id' | 'dictionary_key'>) {
  replaceDictionaryRows(row.dictionary_key, dictionaryRows(row.dictionary_key).filter((item) => Number(item.id) !== Number(row.id)), false);
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

function applyReorderedList(key: SystemDictionaryKey, list: SystemDictionaryItem[], markDirty = true) {
  const normalized = list.map((item, index) => ({
    ...item,
    sort_order: (index + 1) * 10,
  }));
  dictionaries.value = {
    ...dictionaries.value,
    [key]: normalized,
  };
  if (markDirty) markReorderDirty(key, true);
  syncFormDictionaryOptions();
}

function moveLocalRow(key: SystemDictionaryKey, fromIndex: number, toIndex: number) {
  const list = [...dictionaryRows(key)];
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length || fromIndex === toIndex) return;
  const [moved] = list.splice(fromIndex, 1);
  if (!moved) return;
  list.splice(toIndex, 0, moved);
  applyReorderedList(key, list, true);
}

function syncFormDictionaryOptions() {
  form.value = {
    ...form.value,
    asset_archive_reason_options: sortDictionaryList(dictionaryRows('asset_archive_reason')).filter((item) => Number(item.enabled || 0) === 1).map((item) => String(item.label || '').trim()).filter(Boolean),
    dictionary_pc_brand_options: sortDictionaryList(dictionaryRows('pc_brand')).filter((item) => Number(item.enabled || 0) === 1).map((item) => String(item.label || '').trim()).filter(Boolean),
    dictionary_monitor_brand_options: sortDictionaryList(dictionaryRows('monitor_brand')).filter((item) => Number(item.enabled || 0) === 1).map((item) => String(item.label || '').trim()).filter(Boolean),
    dictionary_asset_warehouse_options: sortDictionaryList(dictionaryRows('asset_warehouse')).filter((item) => Number(item.enabled || 0) === 1).map((item) => String(item.label || '').trim()).filter(Boolean),
  };
}

function resetReorderState() {
  reorderDirtyMap.value = {
    asset_archive_reason: false,
      pc_brand: false,
    monitor_brand: false,
    asset_warehouse: false,
  };
  clearDictionaryDrag();
}

async function loadSettingsOnly() {
  form.value = await fetchSystemSettings();
}

async function loadDictionariesOnly() {
  const data = await fetchSystemDictionaries();
  dictionaries.value = normalizeGrouped(data?.grouped);
  resetReorderState();
  syncFormDictionaryOptions();
}

async function reload(options: { force?: boolean } = {}) {
  loading.value = true;
  try {
    form.value = await fetchSystemSettings({ force: options.force });
  } catch (e: any) {
    ElMessage.error(e?.message || '加载配置失败');
  } finally {
    loading.value = false;
  }
  const loadDicts = async () => {
    dictionariesLoading.value = true;
    try {
      const data = await fetchSystemDictionaries(undefined, { force: options.force });
      dictionaries.value = normalizeGrouped(data?.grouped);
      resetReorderState();
      syncFormDictionaryOptions();
    } catch (e: any) {
      ElMessage.error(e?.message || '加载字典失败');
    } finally {
      dictionariesLoading.value = false;
    }
  };
  scheduleOnIdle(() => { void loadDicts(); }, 600);
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
    const created = await createSystemDictionaryItem({
      dictionary_key: createForm.value.dictionary_key,
      label,
      sort_order: createForm.value.sort_order,
      enabled: createForm.value.enabled,
    });
    upsertDictionaryRow(created);
    if (created?.dictionary_key === 'monitor_brand') markMonitorBrandDictionaryChanged();
    createDialogVisible.value = false;
    ElMessage.success('字典项已新增');
  } catch (e: any) {
    ElMessage.error(e?.message || '新增失败');
  } finally {
    creating.value = false;
  }
}

async function saveDictionaryOrder(key: SystemDictionaryKey, quiet = false) {
  if (!hasPendingReorder(key)) return true;
  reorderLoadingMap.value = { ...reorderLoadingMap.value, [key]: true };
  try {
    const response = await reorderSystemDictionaryItems(key, dictionaryRows(key).map((item) => ({ id: item.id, sort_order: item.sort_order, updated_at: item.updated_at } as any)));
    replaceDictionaryRows(key, response?.grouped?.[key] || dictionaryRows(key), false);
    if (key === 'monitor_brand') markMonitorBrandDictionaryChanged();
    markReorderDirty(key, false);
    if (!quiet) ElMessage.success('排序已保存');
    return true;
  } catch (e: any) {
    ElMessage.error(e?.message || '排序保存失败');
    return false;
  } finally {
    reorderLoadingMap.value = { ...reorderLoadingMap.value, [key]: false };
  }
}

async function saveDictionary(row: SystemDictionaryItem) {
  const label = String(row.label || '').trim();
  if (!label) return ElMessage.warning('字典值不能为空');
  if (hasPendingReorder(row.dictionary_key)) {
    const ok = await saveDictionaryOrder(row.dictionary_key, true);
    if (!ok) return;
  }
  rowLoadingMap.value = { ...rowLoadingMap.value, [row.id]: true };
  try {
    const saved = await updateSystemDictionaryItem({
      id: row.id,
      dictionary_key: row.dictionary_key,
      label,
      sort_order: row.sort_order,
      enabled: row.enabled,
      updated_at: row.updated_at,
    });
    upsertDictionaryRow(saved);
    if (saved?.dictionary_key === 'monitor_brand') markMonitorBrandDictionaryChanged();
    ElMessage.success('字典项已保存');
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    rowLoadingMap.value = { ...rowLoadingMap.value, [row.id]: false };
  }
}

function moveRow(key: SystemDictionaryKey, index: number, delta: number) {
  if (reorderBusy(key)) return;
  moveLocalRow(key, index, index + delta);
}

function onDictionaryDragStart(key: SystemDictionaryKey, index: number, id: number) {
  if (reorderBusy(key)) return;
  dragState.value = { key, fromIndex: index, fromId: id };
}

function onDictionaryDragOver(event: DragEvent) {
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function onDictionaryDrop(key: SystemDictionaryKey, index: number) {
  const state = dragState.value;
  if (!state.key || state.key !== key) return;
  moveLocalRow(key, state.fromIndex, index);
  clearDictionaryDrag();
}

function clearDictionaryDrag() {
  dragState.value = { key: null, fromIndex: -1, fromId: null };
}

async function removeDictionary(row: SystemDictionaryItem) {
  await ElMessageBox.confirm(`确认删除字典项“${row.label}”？删除后不可恢复。`, '删除字典项', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  });
  rowLoadingMap.value = { ...rowLoadingMap.value, [row.id]: true };
  try {
    await deleteSystemDictionaryItem(row.id, row.updated_at);
    removeLocalDictionaryRow(row);
    if (row.dictionary_key === 'monitor_brand') markMonitorBrandDictionaryChanged();
    ElMessage.success('字典项已删除');
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败');
  } finally {
    rowLoadingMap.value = { ...rowLoadingMap.value, [row.id]: false };
  }
}

onMounted(() => { reload(); });
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
.row-actions{display:flex;align-items:center;gap:2px;flex-wrap:wrap}
.table-subtle{color:#909399;font-size:12px;margin-top:2px}
.drag-cell{display:flex;align-items:center;justify-content:center;gap:8px;cursor:grab;user-select:none;padding:8px 0;border-radius:10px;border:1px dashed transparent;transition:.15s ease}
.drag-cell:hover{background:#f5f7fa;border-color:#dcdfe6}
.drag-cell--active{background:#ecf5ff;border-color:#409eff;color:#409eff}
.drag-cell--busy{cursor:not-allowed;opacity:.6}
.drag-handle{font-size:16px;line-height:1}
.drag-order{font-size:12px;color:#606266}
</style>
