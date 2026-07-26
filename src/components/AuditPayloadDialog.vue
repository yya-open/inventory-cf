<template>
  <el-dialog
    v-model="showPayload"
    title="审计详情"
    width="860px"
  >
    <div class="payload-toolbar">
      <el-switch
        v-model="prettyMode"
        active-text="格式化"
        inactive-text="原始"
      />
      <el-button
        :disabled="!payloadToCopy"
        @click="copyPayload"
      >
        复制
      </el-button>
      <el-button :disabled="!currentPayloadRow?.entity_id" @click="onFocusEntity">同对象历史</el-button>
    </div>

    <el-tabs v-model="activePayloadTab">
      <el-tab-pane label="概要" name="summary">
        <el-descriptions :column="2" border size="small" class="payload-summary-meta">
          <el-descriptions-item label="动作">
            {{ currentPayloadRow ? actionLabel(currentPayloadRow.action) : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="实体">
            {{ currentPayloadRow ? entityLabel(currentPayloadRow.entity) : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="用户">
            {{ currentPayloadRow?.username || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="时间">
            {{ currentPayloadRow ? formatTime(currentPayloadRow.created_at) : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="实体ID">
            {{ currentPayloadRow?.entity_id ?? '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="对象名称">
            {{ currentPayloadRow?.item_name || currentPayloadRow?.user_name || '-' }}
          </el-descriptions-item>
        </el-descriptions>
        <div v-if="payloadSummaryEntries.length" class="payload-kv-grid">
          <div v-for="item in payloadSummaryEntries" :key="item.key" class="payload-kv-item">
            <div class="payload-kv-label">{{ item.label }}</div>
            <div class="payload-kv-value">{{ item.value }}</div>
          </div>
        </div>
        <el-empty v-else description="暂无结构化摘要" />
      </el-tab-pane>
      <el-tab-pane label="字段变更" name="diff">
        <div v-if="payloadDiffEntries.length" class="payload-diff-list">
          <div v-for="item in payloadDiffEntries" :key="item.key" class="payload-diff-item">
            <div class="payload-diff-key">{{ item.label }}</div>
            <div class="payload-diff-values">
              <div class="payload-diff-cell before">
                <span class="payload-diff-caption">修改前</span>
                <div class="payload-diff-text">{{ item.before }}</div>
              </div>
              <div class="payload-diff-cell after">
                <span class="payload-diff-caption">修改后</span>
                <div class="payload-diff-text">{{ item.after }}</div>
              </div>
            </div>
          </div>
        </div>
        <el-empty v-else description="当前审计记录没有字段差异" />
      </el-tab-pane>
      <el-tab-pane label="JSON" name="json">
        <el-scrollbar
          height="420px"
          class="payload-box"
        >
          <pre class="payload-pre">{{ displayPayload }}</pre>
        </el-scrollbar>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="showPayload=false">
        关闭
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ElDescriptions, ElDescriptionsItem } from 'element-plus/es/components/descriptions/index';
import { ElTabPane, ElTabs } from 'element-plus/es/components/tabs/index';
import { ElScrollbar } from 'element-plus/es/components/scrollbar/index';
import { ref, computed } from "vue";
import { ElMessage } from "../utils/el-services";
import {
  HIDDEN_PAYLOAD_KEYS,
  fieldLabel,
  actionLabel,
  entityLabel,
  formatTime,
  formatAuditValue,
} from "../utils/auditLogFormat";

const emit = defineEmits<{ (e: 'focus-entity', row: any): void }>();

const showPayload = ref(false);
const rawPayload = ref("");
const prettyPayload = ref("");
const prettyMode = ref(true);
const activePayloadTab = ref('summary');
const currentPayloadRow = ref<any | null>(null);

const displayPayload = computed(() => {
  if (!prettyMode.value) return rawPayload.value || "";
  return prettyPayload.value || rawPayload.value || "";
});
const payloadToCopy = computed(() => displayPayload.value || "");
const parsedPayload = computed(() => {
  const pretty = tryPrettyJson(rawPayload.value);
  if (!pretty) return null;
  try {
    return JSON.parse(pretty);
  } catch {
    return null;
  }
});

const payloadSummaryEntries = computed(() => {
  const payload = parsedPayload.value;
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') return [] as Array<{ key: string; label: string; value: string }>;
  if ('before' in payload || 'after' in payload) return [] as Array<{ key: string; label: string; value: string }>;
  return Object.entries(payload)
    .filter(([key]) => !HIDDEN_PAYLOAD_KEYS.has(key))
    .slice(0, 16)
    .map(([key, value]) => ({ key, label: fieldLabel(key), value: formatAuditValue(value) }));
});

const payloadDiffEntries = computed(() => {
  const payload = parsedPayload.value as any;
  const fieldDiffs = Array.isArray(payload?.field_diffs) ? payload.field_diffs : [];
  if (fieldDiffs.length) {
    return fieldDiffs
      .filter((item: any) => {
        const key = String(item?.key || '');
        const last = key.split('.').filter(Boolean).pop() || key;
        return !HIDDEN_PAYLOAD_KEYS.has(key) && !HIDDEN_PAYLOAD_KEYS.has(last);
      })
      .map((item: any) => {
        const key = String(item?.key || '');
        const last = key.split('.').filter(Boolean).pop() || key;
        const baseLabel = fieldLabel(last);
        const label = key && key !== last ? `${baseLabel}（${key}）` : baseLabel;
        return {
          key,
          label,
          before: formatAuditValue(item?.before),
          after: formatAuditValue(item?.after),
        };
      })
      .filter((item: any) => item.before !== item.after);
  }

  const before = payload?.before;
  const after = payload?.after;
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return [] as Array<{ key: string; label: string; before: string; after: string }>;
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter((key) => !HIDDEN_PAYLOAD_KEYS.has(key));
  return keys
    .map((key) => {
      const beforeValue = formatAuditValue(before[key]);
      const afterValue = formatAuditValue(after[key]);
      return { key, label: fieldLabel(key), before: beforeValue, after: afterValue };
    })
    .filter((item) => item.before !== item.after);
});

function tryPrettyJson(text: string){
  const t = String(text || "").trim();
  if (!t) return "";
  try{
    const obj = JSON.parse(t);
    return JSON.stringify(obj, null, 2);
  }catch{
    return "";
  }
}

function open(row: any){
  currentPayloadRow.value = row || null;
  rawPayload.value = String(row?.payload_json || "");
  prettyPayload.value = tryPrettyJson(rawPayload.value);
  prettyMode.value = true;
  activePayloadTab.value = payloadDiffEntries.value.length ? 'diff' : 'summary';
  showPayload.value = true;
}

function onFocusEntity() {
  const row = currentPayloadRow.value;
  if (!row?.entity_id) return;
  showPayload.value = false;
  emit('focus-entity', row);
}

async function copyPayload(){
  const txt = payloadToCopy.value;
  if (!txt) return;
  try{
    await navigator.clipboard.writeText(txt);
    ElMessage.success("已复制");
  }catch{
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    ta.setAttribute("readonly", "true");
    document.body.appendChild(ta);
    ta.select();
    try{
      document.execCommand("copy");
      ElMessage.success("已复制");
    }catch{
      ElMessage.error("复制失败");
    }finally{
      document.body.removeChild(ta);
    }
  }
}

defineExpose({ open });
</script>

<style scoped>
.payload-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.payload-toolbar :deep(.el-button){margin-left:0}
.payload-summary-meta{margin-bottom:14px}
.payload-kv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.payload-kv-item{padding:12px;border:1px solid var(--el-border-color);border-radius:var(--radius-md);background:var(--surface-soft)}
.payload-kv-label{font-size:12px;color:var(--subtle);margin-bottom:6px}
.payload-kv-value{white-space:pre-wrap;word-break:break-word}
.payload-diff-list{display:flex;flex-direction:column;gap:12px}
.payload-diff-item{padding:12px;border:1px solid var(--el-border-color);border-radius:var(--radius-md);background:var(--surface)}
.payload-diff-key{font-weight:700;margin-bottom:10px}
.payload-diff-values{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.payload-diff-cell{padding:10px;border-radius:var(--radius-md)}
.payload-diff-cell.before{background:var(--warning-tint)}
.payload-diff-cell.after{background:var(--success-tint)}
.payload-diff-caption{display:inline-block;font-size:12px;color:var(--muted);margin-bottom:6px}
.payload-diff-text{white-space:pre-wrap;word-break:break-word}
.payload-box{border:1px solid var(--el-border-color);border-radius:var(--radius-md)}
.payload-pre{margin:0;padding:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:12px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
@media (max-width: 900px){.payload-kv-grid,.payload-diff-values{grid-template-columns:1fr}}
@media (max-width: 768px){
  .payload-toolbar{align-items:stretch}
  .payload-toolbar > *,
  .payload-toolbar :deep(.el-button){width:100%;max-width:100%}
}
</style>