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
          <el-button @click="exportCurrentTemplate">导出当前模板</el-button>
          <el-button @click="exportPresetBundle">导出预设包</el-button>
          <el-button @click="triggerImport">导入模板</el-button>
          <input ref="importInputRef" type="file" accept="application/json,.json" class="template-import-input" @change="handleImportFile" />
        </div>

        <el-form label-width="96px" class="template-form">
          <div class="section-title">标签机预设</div>
          <div class="label-preset-row">
            <el-button :type="form.label_preset === 'none' ? 'primary' : 'default'" @click="applyStandardPreset">普通纸张</el-button>
            <el-button
              v-for="item in labelPresets"
              :key="item.key"
              :type="form.label_preset === item.key ? 'primary' : 'default'"
              @click="applyLabelPreset(item.key)"
            >
              {{ item.name }}
            </el-button>
          </div>
          <div class="label-preset-help">
            <div class="hint-line">当前模式：{{ form.label_preset === 'none' ? '普通页面打印' : '标签机单张输出' }}</div>
            <div v-if="activeLabelPreset" class="hint-line">
              推荐：{{ activeLabelPreset.description }} · 默认 {{ activeLabelPreset.recommendedDpi }} DPI
            </div>
          </div>

          <div class="form-grid two-col">
            <el-form-item label="纸张">
              <el-select v-model="form.paper_size" :disabled="form.label_preset !== 'none'">
                <el-option label="A4" value="A4" />
                <el-option label="A5" value="A5" />
                <el-option label="自定义" value="custom" />
              </el-select>
            </el-form-item>
            <el-form-item label="方向">
              <div class="choice-button-row">
                <el-button :type="form.orientation === 'portrait' ? 'primary' : 'default'" :disabled="form.label_preset !== 'none'" @click="form.orientation = 'portrait'">纵向</el-button>
                <el-button :type="form.orientation === 'landscape' ? 'primary' : 'default'" :disabled="form.label_preset !== 'none'" @click="form.orientation = 'landscape'">横向</el-button>
              </div>
            </el-form-item>
          </div>

          <div class="form-grid two-col">
            <el-form-item label="宽度(mm)"><el-input-number v-model="form.custom_width_mm" :min="20" :max="500" :step="1" :disabled="form.paper_size !== 'custom' || form.label_preset !== 'none'" /></el-form-item>
            <el-form-item label="高度(mm)"><el-input-number v-model="form.custom_height_mm" :min="20" :max="500" :step="1" :disabled="form.paper_size !== 'custom' || form.label_preset !== 'none'" /></el-form-item>
          </div>

          <div class="form-grid two-col">
            <el-form-item label="输出 DPI">
              <div class="choice-button-row">
                <el-button :type="form.output_dpi === 203 ? 'primary' : 'default'" @click="form.output_dpi = 203">203 DPI</el-button>
                <el-button :type="form.output_dpi === 300 ? 'primary' : 'default'" @click="form.output_dpi = 300">300 DPI</el-button>
              </div>
            </el-form-item>
            <el-form-item label="页面头部">
              <el-switch v-model="form.show_page_header" :disabled="form.label_preset !== 'none'" inline-prompt active-text="显示" inactive-text="隐藏" />
            </el-form-item>
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
            <el-form-item label="列数"><el-input-number v-model="form.cols" :min="1" :max="8" :step="1" :disabled="form.label_preset !== 'none'" /></el-form-item>
            <el-form-item label="行数"><el-input-number v-model="form.rows" :min="1" :max="10" :step="1" :disabled="form.label_preset !== 'none'" /></el-form-item>
            <el-form-item label="横间距"><el-input-number v-model="form.gap_x_mm" :min="0" :max="30" :step="0.5" :disabled="form.label_preset !== 'none'" /></el-form-item>
            <el-form-item label="纵间距"><el-input-number v-model="form.gap_y_mm" :min="0" :max="30" :step="0.5" :disabled="form.label_preset !== 'none'" /></el-form-item>
          </div>

          <div class="form-grid two-col">
            <el-form-item label="二维码(mm)"><el-input-number v-model="form.qr_size_mm" :min="8" :max="80" :step="1" /></el-form-item>
            <el-form-item label="元信息行数"><el-input-number v-model="form.meta_count" :min="0" :max="6" :step="1" :disabled="!form.show_meta" /></el-form-item>
          </div>

          <div class="section-title">内容模板</div>
          <el-form-item label="模板">
            <div class="choice-button-row content-mode-group">
              <el-button :type="form.content_mode === 'detail' ? 'primary' : 'default'" @click="form.content_mode = 'detail'">明细版</el-button>
              <el-button :type="form.content_mode === 'qr_only' ? 'primary' : 'default'" @click="form.content_mode = 'qr_only'">仅二维码</el-button>
              <el-button :type="form.content_mode === 'model_sn' ? 'primary' : 'default'" @click="form.content_mode = 'model_sn'">二维码+型号+SN</el-button>
              <el-button :type="form.content_mode === 'model_asset' ? 'primary' : 'default'" @click="form.content_mode = 'model_asset'">二维码+型号+资产编号</el-button>
            </div>
          </el-form-item>

          <div class="section-title">显示内容</div>
          <div class="toggle-row">
            <el-checkbox v-model="form.show_title">显示标题</el-checkbox>
            <el-checkbox v-model="form.show_subtitle">显示副标题</el-checkbox>
            <el-checkbox v-model="form.show_meta">显示元信息</el-checkbox>
            <el-checkbox v-model="form.show_link" :disabled="kind === 'sheet' || form.label_preset !== 'none'">显示底部链接</el-checkbox>
          </div>

          <div class="section-title">保存预设</div>
          <div class="preset-save-row">
            <el-input v-model="presetName" placeholder="例如：60x40 标签机 / 电脑标签" clearable />
            <el-button @click="saveCurrentPreset">保存为预设</el-button>
          </div>
        </el-form>
      </section>

      <aside class="print-template-preview">
        <div class="preview-card">
          <div class="preview-title">预览摘要</div>
          <div class="preview-line">{{ kindLabel }}：{{ kind === 'cards' ? '二维码标签' : '二维码图版' }}</div>
          <div class="preview-line">纸张：{{ paperLabel }}</div>
          <div class="preview-line">输出：{{ form.output_dpi }} DPI</div>
          <div class="preview-line">每页：{{ form.cols }} 列 × {{ form.rows }} 行 = {{ form.cols * form.rows }} 个</div>
          <div class="preview-line">单块区域约：{{ cellEstimate.widthMm }} × {{ cellEstimate.heightMm }} mm</div>
          <div class="preview-line">二维码：{{ form.qr_size_mm }} mm</div>
          <div class="preview-line">页头：{{ form.show_page_header ? '显示' : '隐藏' }}</div>
          <div class="preview-line">内容模板：{{ contentModeLabelMap[form.content_mode] }}</div>
          <div class="preview-line">显示：{{ contentSummary }}</div>
          <div class="preview-line">预览比例：1 : {{ previewScaleRatio }}</div>
        </div>
        <div v-if="validationWarnings.length" class="preview-card preview-warning-card">
          <div class="preview-title">内容防错提示</div>
          <div v-for="item in validationWarnings" :key="item" class="preview-warning-line">{{ item }}</div>
        </div>
        <div class="preview-scale-tip">以下预览按真实毫米比例缩放，长文字导出时会自动缩字并在超出时截断。</div>
        <div class="preview-page" :style="previewPageStyle">
          <div v-if="form.show_page_header" class="preview-header" :style="previewHeaderStyle">{{ kind === 'cards' ? '打印标签页' : '打印图版页' }}</div>
          <div class="preview-grid" :style="previewGridStyle">
            <div v-for="index in form.cols * form.rows" :key="index" class="preview-cell" :class="{ vertical: previewVertical }">
              <div class="preview-qr" :style="previewQrStyle"></div>
              <div v-if="form.content_mode !== 'qr_only'" class="preview-text">
                <div v-if="form.show_title" class="preview-text-line strong"></div>
                <div v-if="form.show_subtitle" class="preview-text-line"></div>
                <div v-if="form.show_meta" v-for="metaIndex in Math.max(1, form.meta_count)" :key="metaIndex" class="preview-text-line light"></div>
                <div v-if="form.show_link && kind === 'cards' && form.label_preset === 'none'" class="preview-text-line tiny"></div>
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
  applyQrLabelPreset,
  createDefaultQrPrintTemplate,
  deleteQrPrintPreset,
  estimateQrCellSize,
  exportQrPrintTemplate,
  exportQrPrintTemplateBundle,
  getDefaultQrPrintTemplate,
  getLastUsedQrPrintTemplate,
  getQrLabelPreset,
  listQrLabelPresets,
  importQrPrintTemplateFile,
  listSavedQrPrintPresets,
  normalizeQrPrintTemplate,
  resolveQrPaperDimensions,
  saveQrPrintPreset,
  setDefaultQrPrintTemplate,
  setLastUsedQrPrintTemplate,
  type QrLabelPresetKey,
  type QrPrintContentMode,
  type QrPrintTemplate,
  type QrPrintTemplateKind,
  type QrPrintTemplateScope,
} from '../../utils/qrPrintTemplate';

const props = withDefaults(defineProps<{
  visible: boolean;
  kind: QrPrintTemplateKind;
  kindLabel?: string;
  scope?: 'generic' | 'pc' | 'monitor';
}>(), {
  kindLabel: '二维码',
  scope: 'generic',
});

const emit = defineEmits<{
  'update:visible': [boolean];
  submit: [QrPrintTemplate];
}>();

const visible = computed(() => props.visible);
const kind = computed(() => props.kind);
const kindLabel = computed(() => props.kindLabel);
const scope = computed(() => props.scope as QrPrintTemplateScope);
const form = ref<QrPrintTemplate>(getDefaultQrPrintTemplate(props.kind, props.scope));
const presets = ref<Array<{ id: string; name: string; template: QrPrintTemplate }>>([]);
const selectedPresetId = ref('');
const presetName = ref('');
const labelPresets = listQrLabelPresets();
const importInputRef = ref<HTMLInputElement | null>(null);

function downloadJsonFile(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildExportFilename(mode: 'template' | 'bundle') {
  const scopeLabel = scope.value === 'monitor' ? '显示器' : scope.value === 'pc' ? '电脑' : '通用';
  const kindLabelText = kind.value === 'cards' ? '标签模板' : '图版模板';
  return `inventory_${scopeLabel}_${kindLabelText}_${mode}_${new Date().toISOString().slice(0, 10)}.json`;
}

function exportCurrentTemplate() {
  downloadJsonFile(exportQrPrintTemplate(props.kind, form.value, props.scope), buildExportFilename('template'));
  ElMessage.success('当前模板已导出');
}

function exportPresetBundle() {
  downloadJsonFile(exportQrPrintTemplateBundle(props.kind, props.scope), buildExportFilename('bundle'));
  ElMessage.success('模板预设包已导出');
}

function triggerImport() {
  importInputRef.value?.click();
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const result = importQrPrintTemplateFile(props.kind, payload, props.scope);
    patchForm(result.template);
    presets.value = listSavedQrPrintPresets(props.kind, props.scope);
    const messages = ['模板已导入'];
    if (result.importedDefault) messages.push('默认模板已更新');
    if (result.importedPresetCount) messages.push(`已导入 ${result.importedPresetCount} 个预设`);
    ElMessage.success(messages.join('，'));
  } catch (error: any) {
    ElMessage.error(error?.message || '导入模板失败');
  } finally {
    if (input) input.value = '';
  }
}

function patchForm(next: QrPrintTemplate) {
  form.value = normalizeQrPrintTemplate(props.kind, { ...next });
}

function refreshState() {
  patchForm(getLastUsedQrPrintTemplate(props.kind, props.scope) || getDefaultQrPrintTemplate(props.kind, props.scope));
  presets.value = listSavedQrPrintPresets(props.kind, props.scope);
  selectedPresetId.value = '';
  presetName.value = '';
}

watch(() => [props.visible, props.kind] as const, ([nextVisible]) => {
  if (nextVisible) refreshState();
}, { immediate: true });

function applySelectedPreset() {
  const preset = presets.value.find((item) => item.id === selectedPresetId.value);
  if (!preset) return;
  patchForm(preset.template);
}

function restoreDefaults() {
  patchForm(getDefaultQrPrintTemplate(props.kind, props.scope));
}

function applyStandardPreset() {
  patchForm(getDefaultQrPrintTemplate(props.kind, props.scope));
}

function applyLabelPreset(presetKey: Exclude<QrLabelPresetKey, 'none'>) {
  const next = applyQrLabelPreset(props.kind, presetKey, { ...form.value, label_preset: presetKey });
  patchForm(next);
}

watch(() => form.value.label_preset, (presetKey, prevKey) => {
  if (!visible.value || presetKey === prevKey) return;
  if (presetKey === 'none') {
    if (prevKey !== 'none') patchForm(getDefaultQrPrintTemplate(props.kind, props.scope));
    return;
  }
  patchForm(applyQrLabelPreset(props.kind, presetKey as Exclude<QrLabelPresetKey, 'none'>, form.value));
});

watch(() => props.kind, (nextKind) => {
  patchForm(getDefaultQrPrintTemplate(nextKind, props.scope));
});


async function removeSelectedPreset() {
  const preset = presets.value.find((item) => item.id === selectedPresetId.value);
  if (!preset) return;
  try {
    await ElMessageBox.confirm(`确定删除预设“${preset.name}”吗？`, '删除预设', { type: 'warning' });
  } catch {
    return;
  }
  deleteQrPrintPreset(props.kind, preset.id, props.scope);
  ElMessage.success('预设已删除');
  refreshState();
}

function saveCurrentPreset() {
  try {
    const entry = saveQrPrintPreset(props.kind, presetName.value, form.value, props.scope);
    ElMessage.success(`已保存预设：${entry.name}`);
    presets.value = listSavedQrPrintPresets(props.kind, props.scope);
    selectedPresetId.value = entry.id;
    presetName.value = '';
  } catch (error: any) {
    ElMessage.error(error?.message || '保存预设失败');
  }
}

function setAsDefaultOnly() {
  setDefaultQrPrintTemplate(props.kind, form.value, props.scope);
  ElMessage.success('已设为默认模板');
}

function submit(setDefault: boolean) {
  const normalized = normalizeQrPrintTemplate(props.kind, form.value);
  setLastUsedQrPrintTemplate(props.kind, normalized, props.scope);
  if (setDefault) setDefaultQrPrintTemplate(props.kind, normalized, props.scope);
  emit('submit', normalized);
  emit('update:visible', false);
}

const contentModeLabelMap: Record<QrPrintContentMode, string> = {
  detail: '明细版',
  qr_only: '仅二维码',
  model_sn: '二维码+型号+SN',
  model_asset: '二维码+型号+资产编号',
};

const activeLabelPreset = computed(() => getQrLabelPreset(form.value.label_preset));
const cellEstimate = computed(() => estimateQrCellSize(form.value));
const paperLabel = computed(() => {
  const { pageWidthMm, pageHeightMm } = cellEstimate.value;
  if (activeLabelPreset.value) return `${activeLabelPreset.value.name} 标签`; 
  if (form.value.paper_size === 'custom') return `自定义 ${pageWidthMm} × ${pageHeightMm} mm`;
  return `${form.value.paper_size} ${pageWidthMm} × ${pageHeightMm} mm`;
});
const contentSummary = computed(() => {
  const parts: string[] = [];
  if (form.value.show_title) parts.push('标题');
  if (form.value.show_subtitle) parts.push('副标题');
  if (form.value.show_meta) parts.push(`元信息${form.value.meta_count}行`);
  if (form.value.show_link && props.kind === 'cards' && form.value.label_preset === 'none') parts.push('链接');
  return parts.length ? parts.join(' / ') : '仅二维码';
});


const previewScale = computed(() => {
  const { widthMm, heightMm } = resolveQrPaperDimensions(form.value);
  const maxWidthPx = 280;
  const maxHeightPx = 260;
  return Math.min(maxWidthPx / Math.max(1, widthMm), maxHeightPx / Math.max(1, heightMm));
});

const previewScaleRatio = computed(() => {
  const ratio = 1 / Math.max(0.01, previewScale.value);
  return ratio.toFixed(ratio >= 10 ? 0 : 1);
});

const validationWarnings = computed(() => {
  const warnings: string[] = [];
  const { widthMm, heightMm } = cellEstimate.value;
  const qrMm = form.value.qr_size_mm;
  const smallLabel = !!activeLabelPreset.value && (activeLabelPreset.value.widthMm <= 50 || activeLabelPreset.value.heightMm <= 30);
  if (qrMm < 20) warnings.push('二维码小于 20 mm，部分标签机或扫码枪可能识别不稳。');
  if (form.value.content_mode === 'detail' && widthMm < 42) warnings.push('当前单块区域较窄，明细版可能过密，建议改用“二维码+型号+SN”。');
  if (form.value.show_meta && form.value.meta_count >= 3 && heightMm < 34) warnings.push('元信息行数偏多，导出时会自动缩字，仍建议减少到 1-2 行。');
  if (smallLabel && form.value.content_mode === 'detail') warnings.push('小尺寸标签更适合“仅二维码”或“二维码+型号+SN”。');
  if (form.value.margin_left_mm + form.value.margin_right_mm >= Math.max(6, cellEstimate.value.pageWidthMm * 0.3)) warnings.push('左右边距占比偏大，可适当减小边距提升可用面积。');
  if (form.value.label_preset !== 'none' && form.value.show_link) warnings.push('标签机模板已自动隐藏底部链接，以避免文字过密。');
  return warnings;
});

const previewVertical = computed(() => form.value.label_preset !== 'none' || kind.value === 'sheet');

const previewPageStyle = computed(() => {
  const { widthMm, heightMm } = resolveQrPaperDimensions(form.value);
  const scale = previewScale.value;
  return {
    width: `${Math.round(widthMm * scale)}px`,
    height: `${Math.round(heightMm * scale)}px`,
    paddingTop: `${Math.max(4, Math.round(form.value.margin_top_mm * scale))}px`,
    paddingRight: `${Math.max(4, Math.round(form.value.margin_right_mm * scale))}px`,
    paddingBottom: `${Math.max(4, Math.round(form.value.margin_bottom_mm * scale))}px`,
    paddingLeft: `${Math.max(4, Math.round(form.value.margin_left_mm * scale))}px`,
  };
});

const previewHeaderStyle = computed(() => ({
  minHeight: `${Math.max(20, Math.round(10 * previewScale.value))}px`,
  padding: `${Math.max(4, Math.round(3 * previewScale.value))}px ${Math.max(6, Math.round(4 * previewScale.value))}px`,
  fontSize: `${Math.max(10, Math.round(2.8 * previewScale.value))}px`,
}));

const previewGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${form.value.cols}, minmax(0, 1fr))`,
  gridTemplateRows: `repeat(${form.value.rows}, minmax(0, 1fr))`,
  gap: `${Math.max(2, Math.round(Math.max(form.value.gap_x_mm, form.value.gap_y_mm) * previewScale.value))}px`,
  padding: `${Math.max(6, Math.round(2 * previewScale.value))}px`,
}));

const previewQrStyle = computed(() => {
  const size = Math.max(14, Math.round(form.value.qr_size_mm * previewScale.value));
  return { width: `${size}px`, height: `${size}px` };
});
</script>

<style scoped>
.print-template-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:start}
.preset-toolbar,.preset-save-row,.toggle-row,.label-preset-row,.choice-button-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.template-import-input{display:none}
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
.label-preset-help{display:grid;gap:4px;margin:-2px 0 12px}
.hint-line{font-size:12px;color:#64748b}
.print-template-preview{display:flex;flex-direction:column;gap:14px;position:sticky;top:0}
.preview-card{border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc;padding:14px}
.preview-title{font-size:14px;font-weight:800;margin-bottom:10px;color:#111827}
.preview-line{font-size:12px;line-height:1.6;color:#475569}
.preview-warning-card{background:#fff7ed;border-color:#fdba74}
.preview-warning-line{font-size:12px;line-height:1.6;color:#9a3412}
.preview-scale-tip{font-size:12px;line-height:1.5;color:#64748b}
.preview-page{border:1px solid #dbe3f0;border-radius:16px;background:linear-gradient(180deg,#ffffff,#f8fafc);box-shadow:0 12px 28px rgba(15,23,42,.08);overflow:hidden;display:flex;flex-direction:column}
.preview-header{font-size:12px;font-weight:700;color:#475569;padding:8px 10px;border-bottom:1px solid #eef2f7}
.preview-grid{flex:1;display:grid;align-content:start}
.preview-cell{border:1px solid #dbe3f0;border-radius:10px;background:#fff;display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:start;padding:8px;min-height:0;overflow:hidden}
.preview-cell.vertical{grid-template-columns:1fr;justify-items:center;text-align:center}
.preview-qr{border-radius:8px;background:repeating-linear-gradient(45deg,#111827 0,#111827 4px,#fff 4px,#fff 8px)}
.preview-text{display:grid;gap:4px;min-width:0;width:100%}
.preview-cell.vertical .preview-text{justify-items:center}
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
