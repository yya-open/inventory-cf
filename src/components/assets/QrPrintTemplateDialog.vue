<template>
  <el-dialog
    :model-value="visible"
    class="qr-print-template-dialog"
    width="1100px"
    destroy-on-close
    title="打印模板设置"
    @close="emit('update:visible', false)"
  >
    <div class="print-template-layout">
      <section class="print-template-main">
        <div class="preset-toolbar">
          <el-select v-model="selectedPresetId" clearable placeholder="加载已保存预设" style="min-width: 240px" @change="applySelectedPreset">
            <el-option v-for="item in presets" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
          <el-button :disabled="!selectedPresetId" @click="removeSelectedPreset">删除预设</el-button>
          <el-button @click="restoreDefaults">恢复默认</el-button>
        </div>

        <el-form label-width="92px" class="template-form">
          <div class="form-grid two-col">
            <el-form-item label="纸张">
              <el-select v-model="form.paper_size">
                <el-option label="A4" value="A4" />
                <el-option label="A5" value="A5" />
                <el-option label="自定义" value="custom" />
              </el-select>
            </el-form-item>
            <el-form-item label="方向">
              <el-radio-group v-model="form.orientation">
                <el-radio-button label="portrait">纵向</el-radio-button>
                <el-radio-button label="landscape">横向</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </div>

          <div v-if="form.paper_size === 'custom'" class="form-grid two-col">
            <el-form-item label="宽度(mm)"><el-input-number v-model="form.custom_width_mm" :min="40" :max="500" :step="1" /></el-form-item>
            <el-form-item label="高度(mm)"><el-input-number v-model="form.custom_height_mm" :min="40" :max="500" :step="1" /></el-form-item>
          </div>

          <div class="section-title">边距</div>
          <div class="form-grid four-col compact">
            <el-form-item label="上"><el-input-number v-model="form.margin_top_mm" :min="0" :max="40" :step="0.5" /></el-form-item>
            <el-form-item label="右"><el-input-number v-model="form.margin_right_mm" :min="0" :max="40" :step="0.5" /></el-form-item>
            <el-form-item label="下"><el-input-number v-model="form.margin_bottom_mm" :min="0" :max="40" :step="0.5" /></el-form-item>
            <el-form-item label="左"><el-input-number v-model="form.margin_left_mm" :min="0" :max="40" :step="0.5" /></el-form-item>
          </div>

          <div class="section-title">排版</div>
          <div class="form-grid four-col compact">
            <el-form-item label="列数"><el-input-number v-model="form.cols" :min="1" :max="8" :step="1" /></el-form-item>
            <el-form-item label="行数"><el-input-number v-model="form.rows" :min="1" :max="10" :step="1" /></el-form-item>
            <el-form-item label="横间距"><el-input-number v-model="form.gap_x_mm" :min="0" :max="30" :step="0.5" /></el-form-item>
            <el-form-item label="纵间距"><el-input-number v-model="form.gap_y_mm" :min="0" :max="30" :step="0.5" /></el-form-item>
          </div>

          <div class="form-grid two-col">
            <el-form-item label="二维码(mm)"><el-input-number v-model="form.qr_size_mm" :min="10" :max="80" :step="1" /></el-form-item>
            <el-form-item label="元信息行数"><el-input-number v-model="form.meta_count" :min="0" :max="6" :step="1" :disabled="!form.show_meta" /></el-form-item>
          </div>

          <div class="section-title">显示内容</div>
          <div class="toggle-row">
            <el-checkbox v-model="form.show_title">显示标题</el-checkbox>
            <el-checkbox v-model="form.show_subtitle">显示副标题</el-checkbox>
            <el-checkbox v-model="form.show_meta">显示元信息</el-checkbox>
            <el-checkbox v-model="form.show_link" :disabled="kind === 'sheet'">显示底部链接</el-checkbox>
          </div>

          <div class="section-title">保存预设</div>
          <div class="preset-save-row">
            <el-input v-model="presetName" placeholder="例如：A4 横向 2x3 标签纸" clearable />
            <el-button @click="saveCurrentPreset">保存为预设</el-button>
          </div>
        </el-form>
      </section>

      <aside class="print-template-preview">
        <div class="preview-card">
          <div class="preview-title">预览摘要</div>
          <div class="preview-line">{{ kindLabel }}：{{ kind === 'cards' ? '二维码卡片' : '二维码图版' }}</div>
          <div class="preview-line">纸张：{{ paperLabel }}</div>
          <div class="preview-line">方向：{{ form.orientation === 'landscape' ? '横向' : '纵向' }}</div>
          <div class="preview-line">每页：{{ form.cols }} 列 × {{ form.rows }} 行 = {{ form.cols * form.rows }} 个</div>
          <div class="preview-line">单块区域约：{{ cellEstimate.widthMm }} × {{ cellEstimate.heightMm }} mm</div>
          <div class="preview-line">二维码：{{ form.qr_size_mm }} mm</div>
          <div class="preview-line">边距：上{{ form.margin_top_mm }} / 右{{ form.margin_right_mm }} / 下{{ form.margin_bottom_mm }} / 左{{ form.margin_left_mm }} mm</div>
          <div class="preview-line">内容：{{ contentSummary }}</div>
        </div>
        <div class="preview-page" :style="previewPageStyle">
          <div class="preview-header">{{ kind === 'cards' ? '打印卡片页' : '打印图版页' }}</div>
          <div class="preview-grid" :style="previewGridStyle">
            <div v-for="index in form.cols * form.rows" :key="index" class="preview-cell">
              <div class="preview-qr" :style="previewQrStyle"></div>
              <div class="preview-text">
                <div v-if="form.show_title" class="preview-text-line strong"></div>
                <div v-if="form.show_subtitle" class="preview-text-line"></div>
                <div v-if="form.show_meta" v-for="metaIndex in Math.max(1, form.meta_count)" :key="metaIndex" class="preview-text-line light"></div>
                <div v-if="form.show_link && kind === 'cards'" class="preview-text-line tiny"></div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="emit('update:visible', false)">取消</el-button>
        <el-button @click="setAsDefaultOnly">设为默认</el-button>
        <el-button type="primary" @click="submit(false)">按当前设置导出</el-button>
        <el-button type="success" @click="submit(true)">设为默认并导出</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from '../../utils/el-services';
import {
  createDefaultQrPrintTemplate,
  deleteQrPrintPreset,
  estimateQrCellSize,
  getDefaultQrPrintTemplate,
  listSavedQrPrintPresets,
  normalizeQrPrintTemplate,
  resolveQrPaperDimensions,
  saveQrPrintPreset,
  setDefaultQrPrintTemplate,
  type QrPrintTemplate,
  type QrPrintTemplateKind,
} from '../../utils/qrPrintTemplate';

const props = withDefaults(defineProps<{
  visible: boolean;
  kind: QrPrintTemplateKind;
  kindLabel?: string;
}>(), {
  kindLabel: '二维码',
});

const emit = defineEmits<{
  'update:visible': [boolean];
  submit: [QrPrintTemplate];
}>();

const visible = computed(() => props.visible);
const kind = computed(() => props.kind);
const kindLabel = computed(() => props.kindLabel);
const form = ref<QrPrintTemplate>(createDefaultQrPrintTemplate(props.kind));
const presets = ref<Array<{ id: string; name: string; template: QrPrintTemplate }>>([]);
const selectedPresetId = ref('');
const presetName = ref('');

function refreshState() {
  form.value = normalizeQrPrintTemplate(props.kind, getDefaultQrPrintTemplate(props.kind));
  presets.value = listSavedQrPrintPresets(props.kind);
  selectedPresetId.value = '';
  presetName.value = '';
}

watch(() => [props.visible, props.kind] as const, ([visible]) => {
  if (visible) refreshState();
}, { immediate: true });

function applySelectedPreset() {
  const preset = presets.value.find((item) => item.id === selectedPresetId.value);
  if (!preset) return;
  form.value = normalizeQrPrintTemplate(props.kind, preset.template);
}

function restoreDefaults() {
  form.value = createDefaultQrPrintTemplate(props.kind);
}

async function removeSelectedPreset() {
  const preset = presets.value.find((item) => item.id === selectedPresetId.value);
  if (!preset) return;
  try {
    await ElMessageBox.confirm(`确定删除预设“${preset.name}”吗？`, '删除预设', { type: 'warning' });
  } catch {
    return;
  }
  deleteQrPrintPreset(props.kind, preset.id);
  ElMessage.success('预设已删除');
  refreshState();
}

function saveCurrentPreset() {
  try {
    const entry = saveQrPrintPreset(props.kind, presetName.value, form.value);
    ElMessage.success(`已保存预设：${entry.name}`);
    presets.value = listSavedQrPrintPresets(props.kind);
    selectedPresetId.value = entry.id;
    presetName.value = '';
  } catch (error: any) {
    ElMessage.error(error?.message || '保存预设失败');
  }
}

function setAsDefaultOnly() {
  setDefaultQrPrintTemplate(props.kind, form.value);
  ElMessage.success('已设为默认模板');
}

function submit(setDefault: boolean) {
  const normalized = normalizeQrPrintTemplate(props.kind, form.value);
  if (setDefault) setDefaultQrPrintTemplate(props.kind, normalized);
  emit('submit', normalized);
  emit('update:visible', false);
}

const cellEstimate = computed(() => estimateQrCellSize(form.value));
const paperLabel = computed(() => {
  const { pageWidthMm, pageHeightMm } = cellEstimate.value;
  if (form.value.paper_size === 'custom') return `自定义 ${pageWidthMm} × ${pageHeightMm} mm`;
  return `${form.value.paper_size} ${pageWidthMm} × ${pageHeightMm} mm`;
});
const contentSummary = computed(() => {
  const parts: string[] = [];
  if (form.value.show_title) parts.push('标题');
  if (form.value.show_subtitle) parts.push('副标题');
  if (form.value.show_meta) parts.push(`元信息${form.value.meta_count}行`);
  if (form.value.show_link && props.kind === 'cards') parts.push('链接');
  return parts.length ? parts.join(' / ') : '仅二维码';
});

const previewPageStyle = computed(() => {
  const { widthMm, heightMm } = resolveQrPaperDimensions(form.value);
  const ratio = widthMm / heightMm;
  const heightPx = 260;
  const widthPx = Math.max(170, Math.min(280, Math.round(heightPx * ratio)));
  return {
    width: `${widthPx}px`,
    height: `${heightPx}px`,
    paddingTop: `${Math.max(4, form.value.margin_top_mm)}px`,
    paddingRight: `${Math.max(4, form.value.margin_right_mm)}px`,
    paddingBottom: `${Math.max(4, form.value.margin_bottom_mm)}px`,
    paddingLeft: `${Math.max(4, form.value.margin_left_mm)}px`,
  };
});

const previewGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${form.value.cols}, minmax(0, 1fr))`,
  gridTemplateRows: `repeat(${form.value.rows}, minmax(0, 1fr))`,
  gap: `${Math.max(4, Math.round((form.value.gap_x_mm + form.value.gap_y_mm) / 2 * 1.4))}px`,
}));

const previewQrStyle = computed(() => {
  const size = Math.max(20, Math.min(56, form.value.qr_size_mm * 1.2));
  return { width: `${size}px`, height: `${size}px` };
});
</script>

<style scoped>
.print-template-layout{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:18px;align-items:start}
.preset-toolbar,.preset-save-row,.toggle-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.template-form{margin-top:14px}
.template-form :deep(.el-form-item){margin-bottom:12px;min-width:0}
.template-form :deep(.el-form-item__content){min-width:0}
.template-form :deep(.el-input-number){width:100%}
.template-form :deep(.el-select){width:100%}
.template-form :deep(.el-radio-group){display:flex;flex-wrap:wrap;gap:8px}
.section-title{font-size:13px;font-weight:700;color:#475569;margin:8px 0 12px}
.form-grid{display:grid;gap:12px}
.two-col{grid-template-columns:repeat(2,minmax(0,1fr))}
.four-col{grid-template-columns:repeat(2,minmax(0,1fr))}
.compact :deep(.el-form-item){margin-bottom:10px}
.print-template-preview{display:flex;flex-direction:column;gap:14px;position:sticky;top:0}
.preview-card{border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc;padding:14px}
.preview-title{font-size:14px;font-weight:800;margin-bottom:10px;color:#111827}
.preview-line{font-size:12px;line-height:1.6;color:#475569}
.preview-page{border:1px solid #dbe3f0;border-radius:16px;background:linear-gradient(180deg,#ffffff,#f8fafc);box-shadow:0 12px 28px rgba(15,23,42,.08);overflow:hidden;display:flex;flex-direction:column}
.preview-header{font-size:12px;font-weight:700;color:#475569;padding:8px 10px;border-bottom:1px solid #eef2f7}
.preview-grid{flex:1;display:grid;padding:10px}
.preview-cell{border:1px solid #dbe3f0;border-radius:10px;background:#fff;display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:start;padding:8px;min-height:0;overflow:hidden}
.preview-qr{border-radius:8px;background:repeating-linear-gradient(45deg,#111827 0,#111827 4px,#fff 4px,#fff 8px)}
.preview-text{display:grid;gap:4px;min-width:0}
.preview-text-line{height:7px;border-radius:999px;background:#cbd5e1}
.preview-text-line.strong{width:78%;height:9px;background:#94a3b8}
.preview-text-line.light{width:92%;opacity:.8}
.preview-text-line.tiny{width:100%;height:5px;opacity:.55}
.dialog-footer{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
:deep(.qr-print-template-dialog){width:min(1100px, calc(100vw - 24px)) !important}
:deep(.qr-print-template-dialog .el-dialog__body){padding-top:16px}
@media (max-width: 1200px){.print-template-layout{grid-template-columns:1fr}.print-template-preview{order:-1;position:static}.preview-page{max-width:320px}.four-col{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width: 720px){.two-col,.four-col{grid-template-columns:1fr}}
</style>
