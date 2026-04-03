<template>
  <el-dialog
    :model-value="visible"
    class="qr-dialog"
    width="560px"
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <template #header>
      <div class="qr-header">
        <div class="qr-title">
          <span class="qr-title-main">扫码查看电脑信息</span><span class="qr-title-sub">可控长期码 · 信息实时更新</span>
        </div><el-tag
          v-if="row"
          size="small"
          type="info"
          effect="plain"
        >
          {{ row.brand }} · {{ row.model }}
        </el-tag>
      </div>
    </template><div
      v-loading="loading"
      class="qr-body"
    >
      <div class="qr-left">
        <div class="qr-card">
          <div
            v-if="dataUrl"
            class="qr-box"
          >
            <img
              :src="dataUrl"
              alt="QR"
            >
          </div><div
            v-else
            class="qr-box qr-box-empty"
          >
            <div class="empty-text">
              暂无二维码
            </div>
          </div><div
            v-if="row"
            class="qr-meta"
          >
            <div class="qr-meta-line">
              <span class="k">SN</span><span class="v">{{ row.serial_no || '-' }}</span>
            </div><div class="qr-meta-line">
              <span class="k">状态</span><span class="v">{{ statusText(row.status) }}</span>
            </div>
          </div>
        </div>
      </div><div class="qr-right">
        <div class="qr-actions">
          <div class="qr-action-group">
            <div class="qr-action-title">
              下载
            </div><div class="qr-action-buttons">
              <el-button
                :disabled="!dataUrl || !canExport"
                @click="emit('download-qr')"
              >
                下载二维码
              </el-button><el-button
                :disabled="!link"
                @click="emit('download-label')"
              >
                下载标签
              </el-button>
            </div>
          </div><div class="qr-action-group">
            <div class="qr-action-title">
              操作
            </div><div class="qr-action-buttons">
              <el-button
                type="primary"
                :disabled="!link"
                @click="emit('open-link')"
              >
                打开页面
              </el-button><el-button
                :disabled="!link"
                @click="emit('copy-link')"
              >
                复制链接
              </el-button><el-button
                v-if="canReset"
                type="danger"
                plain
                :disabled="!row?.id"
                @click="emit('reset-qr')"
              >
                重置二维码
              </el-button>
            </div>
          </div>
        </div><div class="qr-link">
          <div class="qr-link-label">
            链接
          </div><el-input
            :model-value="link"
            readonly
          />
        </div><el-alert
          class="qr-tip"
          type="success"
          show-icon
          :closable="false"
          title="提示"
          description="修改台账/出入库后，扫码会自动展示最新数据；管理员重置二维码后旧码立即失效。"
        />
      </div>
    </div><template #footer>
      <div class="qr-footer">
        <div class="qr-footnote">
          建议打印标签时选择“实际大小/100%”，二维码边长 ≥ 25mm 更易识别。
        </div><el-button @click="emit('update:visible', false)">
          关闭
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">defineProps<{ visible:boolean; loading:boolean; dataUrl:string; link:string; row:Record<string,any>|null; isAdmin:boolean; canExport:boolean; canReset:boolean; statusText:(status:string)=>string }>(); const emit = defineEmits<{ 'update:visible':[boolean]; 'download-qr':[]; 'download-label':[]; 'open-link':[]; 'copy-link':[]; 'reset-qr':[] }>();</script>
<style scoped>:deep(.qr-dialog .el-dialog){border-radius:16px}:deep(.qr-dialog .el-dialog__header){padding:16px 18px 10px}:deep(.qr-dialog .el-dialog__body){padding:12px 18px 10px}:deep(.qr-dialog .el-dialog__footer){padding:10px 18px 16px}.qr-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;width:100%}.qr-title{display:flex;flex-direction:column;gap:2px}.qr-title-main{font-weight:800;font-size:18px;line-height:1.2}.qr-title-sub{color:#7a7a7a;font-size:12px}.qr-body{display:grid;grid-template-columns:280px 1fr;gap:16px}.qr-left{display:flex;flex-direction:column;gap:12px;align-items:center}.qr-card{width:100%;padding:14px 12px;border-radius:16px;background:radial-gradient(600px 260px at 50% 0%,rgba(0,0,0,.04),transparent 60%),linear-gradient(180deg,rgba(245,246,248,.98),rgba(255,255,255,.98));border:1px solid rgba(0,0,0,.06);box-shadow:0 16px 34px rgba(0,0,0,.10);display:flex;flex-direction:column;gap:12px;align-items:center}.qr-box{width:240px;height:240px;border-radius:14px;border:1px solid rgba(0,0,0,.06);background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(245,246,248,.95));display:flex;align-items:center;justify-content:center;overflow:hidden}.qr-box img{width:220px;height:220px;display:block}.empty-text{color:#999}.qr-meta{width:240px;border-radius:12px;border:1px solid rgba(0,0,0,.06);background:rgba(255,255,255,.75);padding:10px 12px}.qr-meta-line{display:flex;align-items:center;justify-content:space-between;gap:10px;line-height:1.6;font-size:12px}.qr-meta-line .k{color:#8a8a8a}.qr-meta-line .v{color:#333;font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.qr-right{display:flex;flex-direction:column;gap:12px}.qr-actions{display:flex;flex-direction:column;gap:12px}.qr-action-group{border:1px solid rgba(0,0,0,.06);background:rgba(255,255,255,.75);border-radius:14px;padding:12px}.qr-action-title{font-size:12px;color:#777;margin-bottom:10px}.qr-action-buttons{display:flex;flex-wrap:wrap;gap:10px}.qr-link-label{color:#777;font-size:12px;margin-bottom:6px}.qr-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%}.qr-footnote{color:#8a8a8a;font-size:12px;line-height:1.4}@media (max-width:640px){:deep(.qr-dialog .el-dialog){width:calc(100vw - 24px)!important;margin-top:10vh}.qr-body{grid-template-columns:1fr}.qr-card{width:100%}.qr-box{width:100%;height:auto;padding:12px 0}.qr-box img{width:min(240px,68vw);height:auto}.qr-meta{width:100%}.qr-footer{flex-direction:column;align-items:flex-end}}</style>
