<template>
  <el-dialog
    :model-value="visible"
    class="qr-dialog"
    width="920px"
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <template #header>
      <div class="qr-header">
        <div class="qr-header__intro">
          <div class="qr-header__eyebrow">{{ headerEyebrow }}</div>
          <div class="qr-header__title">{{ headerTitle }}</div>
          <div class="qr-header__desc">{{ headerDesc }}</div>
        </div>
        <el-tag
          v-if="row"
          class="qr-header__tag"
          size="large"
          type="info"
          effect="plain"
        >
          {{ assetName }}
        </el-tag>
      </div>
    </template>

    <div
      v-loading="loading"
      class="qr-body"
    >
      <section class="qr-preview-panel">
        <div class="qr-preview-card">
          <div class="qr-preview-head">
            <div>
              <div class="qr-preview-kicker">二维码预览</div>
              <div class="qr-preview-title">{{ assetName }}</div>
            </div>
            <span
              class="qr-status-chip"
              :class="statusClass"
            >
              {{ currentStatusText }}
            </span>
          </div>

          <div class="qr-code-frame">
            <img
              v-if="dataUrl"
              :src="dataUrl"
              alt="二维码"
            >
            <div
              v-else
              class="qr-empty"
            >
              暂无二维码
            </div>
          </div>

          <div
            v-if="metaItems.length"
            class="qr-meta-grid"
          >
            <div
              v-for="item in metaItems"
              :key="item.label"
              class="qr-meta-item"
            >
              <span class="qr-meta-label">{{ item.label }}</span>
              <span class="qr-meta-value">{{ item.value }}</span>
            </div>
          </div>
        </div>
      </section>

      <aside class="qr-tool-panel">
        <section class="qr-tool-card">
          <div class="qr-tool-card__head">
            <div>
              <div class="qr-tool-card__title">下载</div>
              <div class="qr-tool-card__desc">保存二维码或打印标签。</div>
            </div>
          </div>
          <div class="qr-button-grid">
            <el-button
              class="qr-tool-button"
              :disabled="!dataUrl || !canExport"
              @click="emit('download-qr')"
            >
              <el-icon><Download /></el-icon>
              <span>下载二维码</span>
            </el-button>
            <el-button
              class="qr-tool-button"
              :disabled="!dataUrl || !canExport"
              @click="emit('download-label')"
            >
              <el-icon><Document /></el-icon>
              <span>下载标签</span>
            </el-button>
          </div>
        </section>

        <section class="qr-tool-card">
          <div class="qr-tool-card__head">
            <div>
              <div class="qr-tool-card__title">操作</div>
              <div class="qr-tool-card__desc">打开、复制或更新二维码。</div>
            </div>
          </div>
          <div class="qr-button-stack">
            <el-button
              class="qr-tool-button qr-tool-button--primary"
              type="primary"
              :disabled="!link"
              @click="emit('open-link')"
            >
              <el-icon><TopRight /></el-icon>
              <span>打开页面</span>
            </el-button>
            <el-button
              class="qr-tool-button"
              :disabled="!link"
              @click="emit('copy-link')"
            >
              <el-icon><CopyDocument /></el-icon>
              <span>复制链接</span>
            </el-button>
            <el-button
              v-if="canReset"
              class="qr-tool-button qr-tool-button--danger"
              type="danger"
              plain
              :disabled="!row?.id"
              @click="emit('reset')"
            >
              <el-icon><RefreshRight /></el-icon>
              <span>重置二维码</span>
            </el-button>
          </div>
        </section>

        <section class="qr-link-card">
          <div class="qr-tool-card__title">链接</div>
          <el-input
            :model-value="link"
            class="qr-link-input"
            readonly
          >
            <template #append>
              <el-button
                :disabled="!link"
                title="复制链接"
                @click="emit('copy-link')"
              >
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </template>
          </el-input>
        </section>

        <section class="qr-tip-card">
          <div class="qr-tip-card__icon">
            <el-icon><InfoFilled /></el-icon>
          </div>
          <div>
            <div class="qr-tip-card__title">{{ tipTitle }}</div>
            <div class="qr-tip-card__text">
              {{ tipText }}
            </div>
          </div>
        </section>
      </aside>
    </div>

    <template #footer>
      <div class="qr-footer">
        <div class="qr-footnote">
          {{ footnoteText }}
        </div>
        <el-button @click="emit('update:visible', false)">
          关闭
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CopyDocument, Document, Download, InfoFilled, RefreshRight, TopRight } from '@element-plus/icons-vue';

type MetaItem = {
  label: string;
  value: string;
};

const props = withDefaults(defineProps<{
  visible: boolean;
  loading: boolean;
  dataUrl: string;
  link: string;
  row: Record<string, any> | null;
  canExport: boolean;
  canReset: boolean;
  statusText: (status: string) => string;
  headerEyebrow: string;
  headerTitle: string;
  headerDesc: string;
  assetName: string;
  metaItems?: MetaItem[];
  tipTitle?: string;
  tipText?: string;
  footnoteText?: string;
}>(), {
  metaItems: () => [],
  tipTitle: '提示',
  tipText: '修改台账/出入库后，扫码会自动展示最新数据；管理员重置二维码后旧码立即失效。',
  footnoteText: '建议打印标签时选择“实际大小100%”，二维码边长 ≥ 25mm 更易识别。',
});

const emit = defineEmits<{
  'update:visible': [boolean];
  'download-qr': [];
  'download-label': [];
  'open-link': [];
  'copy-link': [];
  'reset': [];
}>();

const currentStatusText = computed(() => props.statusText(String(props.row?.status || '')));

const statusClass = computed(() => {
  const status = String(props.row?.status || '').toUpperCase();
  if (status === 'IN_STOCK') return 'is-success';
  if (status === 'ASSIGNED') return 'is-warning';
  if (status === 'RECYCLED') return 'is-info';
  if (status === 'SCRAPPED') return 'is-danger';
  return '';
});
</script>

<style scoped>
:deep(.qr-dialog .el-dialog) {
  max-width: calc(100vw - 32px);
  border: 1px solid var(--ent-border-soft, #e7ebf2);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 24px 70px rgba(16, 24, 40, 0.2);
}

:deep(.qr-dialog .el-dialog__header) {
  padding: 26px 30px 18px;
  margin-right: 0;
  border-bottom: 1px solid var(--ent-border-soft, #e7ebf2);
  background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
}

:deep(.qr-dialog .el-dialog__headerbtn) {
  top: 22px;
  right: 24px;
}

:deep(.qr-dialog .el-dialog__body) {
  padding: 28px 30px;
  background: #ffffff;
}

:deep(.qr-dialog .el-dialog__footer) {
  padding: 18px 30px 24px;
  border-top: 1px solid var(--ent-border-soft, #e7ebf2);
  background: #ffffff;
}

.qr-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding-right: 34px;
}

.qr-header__intro {
  min-width: 0;
}

.qr-header__eyebrow {
  margin-bottom: 8px;
  color: var(--ent-subtle, #8a94a6);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.08em;
}

.qr-header__title {
  color: var(--ent-text, #1f2937);
  font-size: 26px;
  font-weight: 800;
  line-height: 1.2;
}

.qr-header__desc {
  margin-top: 6px;
  color: var(--ent-muted, #667085);
  font-size: 14px;
}

.qr-header__tag {
  max-width: 360px;
  height: 34px;
  padding: 0 14px;
  border-radius: 6px;
  color: var(--ent-muted, #667085);
  font-weight: 700;
}

.qr-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 314px;
  gap: 22px;
  align-items: stretch;
}

.qr-preview-panel,
.qr-tool-card,
.qr-link-card,
.qr-tip-card {
  border: 1px solid var(--ent-border, #d8dee9);
  border-radius: 8px;
  background: #ffffff;
}

.qr-preview-panel {
  display: flex;
  min-height: 570px;
  padding: 24px;
  background:
    linear-gradient(135deg, rgba(31, 95, 191, 0.08) 0, transparent 36%),
    linear-gradient(180deg, #f8fafc 0, #ffffff 70%);
}

.qr-preview-card {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-width: 0;
  padding: 24px;
  border: 1px solid rgba(216, 222, 233, 0.86);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 18px 38px rgba(16, 24, 40, 0.08);
}

.qr-preview-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.qr-preview-kicker {
  margin-bottom: 6px;
  color: var(--ent-subtle, #8a94a6);
  font-size: 12px;
  font-weight: 700;
}

.qr-preview-title {
  color: var(--ent-text, #1f2937);
  font-size: 18px;
  font-weight: 800;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qr-status-chip {
  flex: 0 0 auto;
  min-width: 64px;
  padding: 6px 10px;
  border: 1px solid #d8dee9;
  border-radius: 999px;
  color: var(--ent-muted, #667085);
  background: #f8fafc;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  text-align: center;
}

.qr-status-chip.is-success {
  border-color: rgba(60, 140, 68, 0.26);
  color: #27763c;
  background: #edf8ef;
}

.qr-status-chip.is-warning {
  border-color: rgba(184, 119, 18, 0.28);
  color: #9a650f;
  background: #fff7e7;
}

.qr-status-chip.is-info {
  border-color: rgba(102, 112, 133, 0.24);
  color: #667085;
  background: #f2f4f7;
}

.qr-status-chip.is-danger {
  border-color: rgba(199, 53, 43, 0.24);
  color: #b42318;
  background: #fff1f0;
}

.qr-code-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(360px, 100%);
  aspect-ratio: 1;
  padding: 24px;
  border: 1px solid rgba(216, 222, 233, 0.9);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 249, 252, 0.98)),
    #ffffff;
}

.qr-code-frame img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qr-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: 1px dashed var(--ent-border, #d8dee9);
  border-radius: 8px;
  color: var(--ent-subtle, #8a94a6);
  background: #f8fafc;
  font-weight: 700;
}

.qr-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
}

.qr-meta-item {
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--ent-border-soft, #e7ebf2);
  border-radius: 8px;
  background: #f8fafc;
}

.qr-meta-label {
  display: block;
  margin-bottom: 6px;
  color: var(--ent-subtle, #8a94a6);
  font-size: 12px;
  font-weight: 700;
}

.qr-meta-value {
  display: block;
  color: var(--ent-text, #1f2937);
  font-size: 16px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qr-tool-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.qr-tool-card,
.qr-link-card,
.qr-tip-card {
  padding: 16px;
}

.qr-tool-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
}

.qr-tool-card__title {
  color: var(--ent-text, #1f2937);
  font-size: 15px;
  font-weight: 800;
}

.qr-tool-card__desc {
  margin-top: 4px;
  color: var(--ent-subtle, #8a94a6);
  font-size: 12px;
}

.qr-button-grid,
.qr-button-stack {
  display: grid;
  gap: 10px;
}

.qr-button-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.qr-button-stack {
  grid-template-columns: 1fr;
}

.qr-tool-button.el-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  min-height: 42px;
  margin: 0;
  padding: 0 14px;
  white-space: normal;
}

.qr-tool-button--primary.el-button {
  min-height: 46px;
  font-size: 15px;
}

.qr-tool-button--danger.el-button.is-plain {
  color: var(--ent-danger, #c7352b);
  background: #fff8f7;
}

.qr-link-card {
  display: grid;
  gap: 10px;
}

.qr-link-input :deep(.el-input__wrapper) {
  min-height: 42px;
  box-shadow: 0 0 0 1px var(--ent-border, #d8dee9) inset;
}

.qr-link-input :deep(.el-input__inner) {
  color: var(--ent-muted, #667085);
  font-weight: 600;
}

.qr-link-input :deep(.el-input-group__append) {
  padding: 0;
  background: #f8fafc;
}

.qr-link-input :deep(.el-input-group__append .el-button) {
  height: 40px;
  margin: 0;
  border: 0;
}

.qr-tip-card {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 12px;
  border-color: rgba(60, 140, 68, 0.22);
  background: #f0faed;
}

.qr-tip-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  color: #ffffff;
  background: #52b837;
  font-size: 20px;
}

.qr-tip-card__title {
  color: #2f8d1f;
  font-size: 16px;
  font-weight: 800;
}

.qr-tip-card__text {
  margin-top: 6px;
  color: #3c9b2c;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.55;
}

.qr-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  width: 100%;
}

.qr-footnote {
  color: var(--ent-muted, #667085);
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 860px) {
  :deep(.qr-dialog .el-dialog) {
    width: calc(100vw - 24px) !important;
    margin-top: 5vh;
  }

  :deep(.qr-dialog .el-dialog__header),
  :deep(.qr-dialog .el-dialog__body),
  :deep(.qr-dialog .el-dialog__footer) {
    padding-right: 18px;
    padding-left: 18px;
  }

  .qr-header {
    flex-direction: column;
    gap: 12px;
    padding-right: 32px;
  }

  .qr-header__title {
    font-size: 22px;
  }

  .qr-header__tag {
    max-width: 100%;
  }

  .qr-body {
    grid-template-columns: 1fr;
  }

  .qr-preview-panel {
    min-height: 0;
    padding: 16px;
  }

  .qr-code-frame {
    width: min(320px, 100%);
    padding: 18px;
  }
}

@media (max-width: 520px) {
  .qr-preview-card {
    padding: 18px;
  }

  .qr-preview-head,
  .qr-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .qr-status-chip {
    width: max-content;
  }

  .qr-meta-grid,
  .qr-button-grid {
    grid-template-columns: 1fr;
  }

  .qr-footer .el-button {
    width: 100%;
  }
}
</style>
