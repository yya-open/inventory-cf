<template>
  <el-card class="audit-card">
    <template #header>
      <div class="audit-header">
        <div class="title">
          审计日志
        </div>
        <div class="tools">
          <el-button
            type="primary"
            @click="onSearch"
          >
            查询
          </el-button>
          <el-button @click="reset">
            重置
          </el-button>
          <el-button @click="exportCurrentRows">
            导出当前页
          </el-button>
          <el-button @click="exportFilteredRows">
            导出筛选结果
          </el-button>
          <el-button
            type="info"
            plain
            @click="openRetention"
          >
            保留策略
          </el-button>
          <el-button
            v-if="isAdmin"
            type="danger"
            plain
            :disabled="selectedIds.length===0"
            @click="deleteSelected"
          >
            删除选中 ({{ selectedIds.length }})
          </el-button>
        </div>
      </div>

      <el-form
        class="audit-filters"
        :inline="true"
        @submit.prevent
      >
        <el-form-item>
          <el-input
            v-model="keyword"
            placeholder="搜索：用户/动作/实体/ID"
            clearable
            style="width: 240px"
          />
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="action"
            placeholder="动作"
            clearable
            filterable
            style="width: 190px"
            @change="onSearch"
          >
            <el-option
              v-for="opt in actionFilterOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="entity"
            placeholder="实体"
            clearable
            filterable
            style="width: 190px"
            @change="onSearch"
          >
            <el-option
              v-for="opt in entityFilterOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="entityId"
            placeholder="对象ID（如资产ID / tx_no）"
            clearable
            style="width: 190px"
          />
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="moduleFilter"
            placeholder="模块"
            clearable
            style="width: 150px"
            @change="onSearch"
          >
            <el-option v-for="opt in moduleOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-switch v-model="highRiskOnly" active-text="高风险" inactive-text="全部" @change="onSearch" />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="user"
            placeholder="用户（如 admin）"
            clearable
            style="width: 150px"
          />
        </el-form-item>
        <el-form-item>
          <el-date-picker
            v-model="range"
            type="daterange"
            range-separator="-"
            start-placeholder="开始"
            end-placeholder="结束"
          />
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="sortBy"
            placeholder="排序字段"
            style="width: 140px"
            @change="onSearch"
          >
            <el-option
              label="时间"
              value="created_at"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="sortDir"
            placeholder="方向"
            style="width: 120px"
            @change="onSearch"
          >
            <el-option
              label="倒序"
              value="desc"
            />
            <el-option
              label="正序"
              value="asc"
            />
          </el-select>
        </el-form-item>
      </el-form>
    </template>

    <LazyMountBlock title="正在装载审计列表…" min-height="420px">
      <el-table
        v-loading="loading"
        :data="rows"
        border
        style="width:100%"
        @selection-change="onSelect"
      >
      <el-table-column
        v-if="isAdmin"
        type="selection"
        width="48"
      />
      <el-table-column
        label="#"
        width="80"
      >
        <template #default="{ $index }">
          {{ (page - 1) * pageSize + $index + 1 }}
        </template>
      </el-table-column>
      <el-table-column
        label="时间"
        min-width="170"
      >
        <template #default="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column
        prop="username"
        label="用户"
        width="130"
      />
      <el-table-column
        label="动作"
        min-width="160"
      >
        <template #default="{ row }">
          <el-tag
            :title="row.action"
            :type="tagType(row.action)"
            effect="light"
          >
            {{ actionLabel(row.action) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        label="实体"
        min-width="180"
      >
        <template #default="{ row }">
          <div class="entity-cell">
            <div class="entity-name">
              {{ row.item_name || row.user_name || entityLabel(row.entity) || "-" }}
            </div>
            <div
              v-if="row.item_name || row.user_name"
              class="entity-meta"
            >
              {{ entityLabel(row.entity) }}
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="140"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            @click="openPayload(row)"
          >
            查看
          </el-button>
          <el-button link @click="focusEntityHistory(row)">同对象历史</el-button>
          <el-popconfirm
            v-if="isAdmin"
            title="确认删除该审计日志？"
            @confirm="deleteOne(row.id)"
          >
            <template #reference>
              <el-button
                link
                type="danger"
              >
                删除
              </el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <div style="display:flex; justify-content:flex-end; margin-top:12px">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        background
        layout="total, sizes, prev, pager, next, jumper"
        :page-sizes="[20, 50, 100, 200]"
        @current-change="onPageChange"
        @size-change="onPageSizeChange"
      />
    </div>
    </LazyMountBlock>

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
        <el-button :disabled="!currentPayloadRow?.entity_id" @click="currentPayloadRow && focusEntityHistory(currentPayloadRow)">同对象历史</el-button>
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

    <el-dialog
      v-model="showRetention"
      title="审计保留与归档策略"
      width="760px"
    >
      <div style="color:#606266; margin-bottom:10px">
        当前策略：保留近 <b>{{ retentionDays }}</b> 天；上次清理：{{ retentionLast || "-" }}；上次归档：{{ archiveLast || "-" }}
      </div>
      <el-alert
        v-if="auditWarnings.length"
        type="warning"
        show-icon
        :closable="false"
        style="margin-bottom:12px"
      >
        <div v-for="item in auditWarnings" :key="item.code">{{ item.message }}</div>
      </el-alert>
      <div class="audit-retention-stats">
        <div class="stats-item"><span>审计行数</span><b>{{ auditStats.total_rows }}</b></div>
        <div class="stats-item"><span>可归档</span><b>{{ auditStats.eligible_rows }}</b></div>
        <div class="stats-item"><span>估算体积</span><b>{{ auditStats.approx_audit_mb }} MB</b></div>
        <div class="stats-item"><span>数据库体积</span><b>{{ auditStats.db_size_mb }} MB</b></div>
      </div>
      <el-form label-width="140px">
        <el-form-item label="保留天数">
          <el-input-number v-model="retentionDaysEdit" :min="1" :max="3650" controls-position="right" />
        </el-form-item>
        <el-form-item label="自动归档">
          <el-switch v-model="archiveEnabled" active-text="开启" inactive-text="关闭" />
        </el-form-item>
        <el-form-item label="归档门槛（天）">
          <el-input-number v-model="archiveAfterDays" :min="1" :max="3650" controls-position="right" />
        </el-form-item>
        <el-form-item label="归档后删除源记录">
          <el-switch v-model="deleteAfterArchive" active-text="是" inactive-text="否" />
        </el-form-item>
        <el-form-item label="单次归档上限">
          <el-input-number v-model="maxArchiveRows" :min="100" :max="50000" :step="500" controls-position="right" />
        </el-form-item>
        <el-form-item label="库体积预警 (MB)">
          <el-input-number v-model="warnDbSizeMb" :min="64" :max="4096" :step="16" controls-position="right" />
        </el-form-item>
        <el-form-item label="审计行数预警">
          <el-input-number v-model="warnAuditRows" :min="1000" :max="5000000" :step="1000" controls-position="right" />
        </el-form-item>
        <el-form-item label="审计体积预警 (MB)">
          <el-input-number v-model="warnAuditBytesMb" :min="16" :max="4096" :step="16" controls-position="right" />
        </el-form-item>
        <el-form-item label="立即清理">
          <el-switch v-model="runCleanup" active-text="是" inactive-text="否" />
        </el-form-item>
        <el-alert v-if="runCleanup" type="warning" show-icon :closable="false">将删除早于保留天数的审计日志。确认后不可恢复。</el-alert>
      </el-form>
      <div class="archive-history" v-if="archiveRuns.length">
        <div class="archive-history__title">最近归档</div>
        <div class="archive-history__list">
          <div v-for="run in archiveRuns" :key="run.id" class="archive-history__row">
            <span>{{ run.created_at }}</span>
            <span>截止 {{ run.archive_before }}</span>
            <span>导出 {{ run.exported_rows }}</span>
            <span v-if="run.deleted_rows">删除 {{ run.deleted_rows }}</span>
            <span>{{ run.result_filename || '-' }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showRetention=false">取消</el-button>
        <el-button type="warning" :loading="archiveSubmitting" @click="createArchiveJob">立即归档</el-button>
        <el-button type="primary" :loading="retentionSaving" @click="saveRetention">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ElDescriptions, ElDescriptionsItem, ElTabPane, ElTabs } from 'element-plus';
import { ElPopconfirm, ElScrollbar } from 'element-plus';
import { ref, onMounted, computed, watch } from "vue";
import { useRoute } from "vue-router";
import { apiGet, apiPost } from "../api/client";
import { can, canCapability, canPerm } from "../store/auth";
import { ElMessage, ElMessageBox } from "../utils/el-services";
import { formatBeijingDateTime } from "../utils/datetime";
import { exportToXlsx } from "../utils/excel";
import { readJsonStorage, writeJsonStorage } from "../utils/storage";
import { getCachedSystemSettings } from "../api/systemSettings";
import LazyMountBlock from "../components/LazyMountBlock.vue";


const ACTION_LABEL: Record<string, string> = {
  STOCK_IN: "入库",
  STOCK_OUT: "出库",
  BATCH_IN: "批量入库",
  BATCH_OUT: "批量出库",
  TX_EXPORT: "导出出入库流水",
  TX_CLEAR: "清空出入库明细",

  STOCKTAKE_CREATE: "创建盘点单",
  STOCKTAKE_IMPORT: "导入盘点结果",
  STOCKTAKE_APPLY: "应用盘点",
  STOCKTAKE_ROLLBACK: "回滚盘点",
  STOCKTAKE_DELETE: "删除盘点单",

  ITEM_CREATE: "新增配件",
  ITEM_UPDATE: "修改配件",
  ITEM_DELETE: "删除配件",

  USER_CREATE: "新增用户",
  USER_UPDATE: "修改用户",
  USER_DELETE: "删除用户",
  USER_RESET_PASSWORD: "重置用户密码",

  AUDIT_DELETE: "删除审计日志",

  ADMIN_INIT_SCHEMA: "初始化系统结构",
  ADMIN_BACKUP: "导出备份",
  ADMIN_RESTORE: "恢复备份",
  ADMIN_RESTORE_UPLOAD: "直传恢复备份",
  ADMIN_RESTORE_JOB_CREATE: "创建恢复任务",
  ADMIN_RESTORE_JOB_PAUSE: "暂停恢复任务",
  ADMIN_RESTORE_JOB_CANCELED: "取消恢复任务",
  ADMIN_RESTORE_JOB_SCAN_DONE: "恢复任务扫描完成",
  ADMIN_RESTORE_JOB_SNAPSHOT_SKIPPED: "恢复任务跳过快照",
  ADMIN_RESTORE_JOB_SNAPSHOT_DONE: "恢复任务快照完成",
  ADMIN_RESTORE_JOB_DONE: "恢复任务完成",
  ADMIN_RESTORE_JOB_FAILED: "恢复任务失败",
  ADMIN_RESTORE_JOB_ROLLBACK_CREATE: "创建恢复回滚任务",

  PC_IN: "电脑入库",
  PC_IN_BATCH: "批量电脑入库",
  PC_OUT: "电脑出库",
  PC_OUT_BATCH: "批量电脑出库",
  PC_RETURN: "电脑归还",
  PC_RETURN_BATCH: "批量电脑归还",
  PC_RECYCLE: "电脑回收",
  PC_RECYCLE_BATCH: "批量电脑回收",
  PC_SCRAP: "电脑报废",
  PC_ASSET_UPDATE: "修改电脑台账",
  PC_ASSET_DELETE: "删除电脑台账",
  PC_ASSET_PURGE: "彻底删除电脑台账",
  PC_TX_DELETE: "删除电脑事务",
  PC_TX_CLEAR: "清空电脑事务",
  PC_LOCATION_CREATE: "新增电脑位置",
  PC_LOCATION_UPDATE: "修改电脑位置",
  PC_LOCATION_DELETE: "删除电脑位置",
  PC_INVENTORY_LOG_DELETE: "删除电脑盘点记录",
  PC_INVENTORY_LOG_EXPORT: "导出电脑盘点记录",

  MONITOR_SCHEMA_INIT: "初始化显示器模块",
  MONITOR_ASSET_CREATE: "新增显示器台账",
  MONITOR_ASSET_UPDATE: "修改显示器台账",
  MONITOR_ASSET_DELETE: "删除显示器台账",
  MONITOR_ASSET_PURGE: "彻底删除显示器台账",
  PC_ASSET_ARCHIVE: "归档电脑台账",
  PC_ASSET_ARCHIVE_BATCH: "批量归档电脑台账",
  PC_ASSET_RESTORE_BATCH: "批量恢复电脑归档",
  PC_ASSET_STATUS_BATCH: "批量修改电脑状态",
  PC_ASSET_OWNER_BATCH: "批量修改电脑领用人",
  MONITOR_ASSET_ARCHIVE: "归档显示器台账",
  MONITOR_ASSET_ARCHIVE_BATCH: "批量归档显示器台账",
  MONITOR_ASSET_RESTORE_BATCH: "批量恢复显示器归档",
  MONITOR_ASSET_STATUS_BATCH: "批量修改显示器状态",
  MONITOR_ASSET_LOCATION_BATCH: "批量修改显示器位置",
  MONITOR_ASSET_OWNER_BATCH: "批量修改显示器领用人",
  MONITOR_IN: "显示器入库",
  MONITOR_OUT: "显示器出库",
  MONITOR_RETURN: "显示器归还",
  MONITOR_TRANSFER: "显示器调拨",
  MONITOR_SCRAP: "显示器报废",
  MONITOR_TX_DELETE: "删除显示器事务",
  MONITOR_TX_EXPORT: "导出显示器事务",
  MONITOR_INVENTORY_LOG_DELETE: "删除显示器盘点记录",
  MONITOR_INVENTORY_LOG_EXPORT: "导出显示器盘点记录",
  SYSTEM_DICTIONARY_CREATE: "新增系统字典项",
  SYSTEM_DICTIONARY_UPDATE: "修改系统字典项",
  SYSTEM_DICTIONARY_DELETE: "删除系统字典项",
  SYSTEM_DICTIONARY_REORDER: "调整系统字典排序",

  pc_asset_update: "修改电脑台账",
  pc_asset_delete: "删除电脑台账",
  pc_asset_purge: "彻底删除电脑台账",
  pc_tx_delete: "删除电脑事务",
  pc_tx_clear: "清空电脑事务",
  monitor_asset_create: "新增显示器台账",
  monitor_asset_update: "修改显示器台账",
  monitor_asset_delete: "删除显示器台账",
  monitor_asset_purge: "彻底删除显示器台账",
};

const ACTION_TOKEN_LABEL: Record<string, string> = {
  STOCK: '库存',
  STOCKTAKE: '盘点',
  ITEM: '配件',
  ITEMS: '配件',
  USER: '用户',
  USERS: '用户',
  AUDIT: '审计',
  ADMIN: '系统管理',
  PC: '电脑',
  MONITOR: '显示器',
  ASSET: '台账',
  ASSETS: '台账',
  TX: '事务',
  INVENTORY: '盘点',
  LOG: '记录',
  LOCATION: '位置',
  LOCATIONS: '位置',
  DICTIONARY: '字典',
  DICTIONARIES: '字典',
  SYSTEM: '系统',
  SCHEMA: '结构',
  BACKUP: '备份',
  RESTORE: '恢复',
  JOB: '任务',
  STOCK_TX: '出入库流水',
  CREATE: '新增',
  UPDATE: '修改',
  DELETE: '删除',
  PURGE: '彻底删除',
  ARCHIVE: '归档',
  BATCH: '批量',
  STATUS: '状态',
  OWNER: '领用人',
  PASSWORD: '密码',
  INIT: '初始化',
  IN: '入库',
  OUT: '出库',
  RETURN: '归还',
  RECYCLE: '回收',
  SCRAP: '报废',
  EXPORT: '导出',
  IMPORT: '导入',
  APPLY: '应用',
  ROLLBACK: '回滚',
  CLEAR: '清空',
  RESET: '重置',
  TRANSFER: '调拨',
  PAUSE: '暂停',
  CANCELED: '取消',
  CANCEL: '取消',
  SCAN: '扫描',
  SNAPSHOT: '快照',
  SKIPPED: '跳过',
  DONE: '完成',
  FAILED: '失败',
  UPLOAD: '上传',
  RETENTION: '保留',
  THROTTLE: '限流',
};

const ACTION_VERB_TOKENS = new Set([
  'CREATE', 'UPDATE', 'DELETE', 'PURGE', 'ARCHIVE', 'RESTORE', 'EXPORT', 'IMPORT', 'APPLY',
  'ROLLBACK', 'CLEAR', 'RESET', 'INIT', 'IN', 'OUT', 'RETURN', 'RECYCLE', 'SCRAP', 'TRANSFER',
  'PAUSE', 'CANCELED', 'CANCEL', 'SCAN', 'DONE', 'FAILED', 'UPLOAD',
]);

const ENTITY_LABEL: Record<string, string> = {
  stock_tx: "出入库流水",
  stocktake: "盘点单",
  items: "配件",
  users: "用户",
  audit_log: "审计日志",
  stock: "库存",
  warehouse: "仓库",
  warehouses: "仓库",
  backup: "备份",
  restore_job: "恢复任务",
  schema: "系统结构",
  pc_assets: "电脑台账",
  pc_in: "电脑入库记录",
  pc_out: "电脑出库记录",
  pc_recycle: "电脑回收记录",
  pc_scrap: "电脑报废记录",
  pc_tx: "电脑事务",
  pc_tx_detail: "电脑事务明细",
  pc_locations: "电脑位置",
  pc_inventory_log: "电脑盘点记录",
  monitor_assets: "显示器台账",
  monitor_tx: "显示器事务",
  monitor_inventory_log: "显示器盘点记录",
  system_dictionary_items: "系统字典项",
};

const FIELD_LABEL: Record<string, string> = {
  id: 'ID',
  brand: '品牌',
  model: '型号',
  serial_no: '序列号',
  asset_code: '资产编号',
  sn: 'SN',
  status: '状态',
  remark: '备注',
  employee_no: '员工工号',
  employee_name: '领用人',
  department: '部门',
  location_id: '位置ID',
  location_name: '位置',
  location_text: '位置',
  size_inch: '尺寸',
  disk_capacity: '硬盘容量',
  memory_size: '内存大小',
  manufacture_date: '出厂时间',
  warranty_end: '保修到期',
  retention_days: '保留天数',
  confirm: '确认词',
  reason: '原因',
  created_by: '创建人',
  updated_at: '更新时间',
};
const HIDDEN_PAYLOAD_KEYS = new Set(['password', 'new_password', 'old_password', 'confirm']);

function fieldLabel(key: string) {
  return FIELD_LABEL[key] || prettifyCodeLabel(key) || '-';
}

function prettifyCodeLabel(value: string) {
  return String(value || "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitCodeTokens(value: string) {
  return String(value || '')
    .trim()
    .replace(/[.\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .split('_')
    .filter(Boolean);
}

function translateActionCode(value: string) {
  const tokens = splitCodeTokens(value).map((token) => token.toUpperCase());
  if (!tokens.length) return '';

  const hasBatch = tokens.includes('BATCH');
  const coreTokens = tokens.filter((token) => token !== 'BATCH');
  const verbIndex = [...coreTokens].reverse().findIndex((token) => ACTION_VERB_TOKENS.has(token));

  if (verbIndex !== -1) {
    const actualVerbIndex = coreTokens.length - 1 - verbIndex;
    const verbToken = coreTokens[actualVerbIndex];
    const verb = ACTION_TOKEN_LABEL[verbToken] || '';
    const target = coreTokens
      .filter((_, index) => index !== actualVerbIndex)
      .map((token) => ACTION_TOKEN_LABEL[token] || ENTITY_LABEL[token.toLowerCase()] || prettifyCodeLabel(token))
      .join('');
    if (verb) return `${hasBatch ? '批量' : ''}${verb}${target}`;
  }

  const translated = tokens
    .map((token) => ACTION_TOKEN_LABEL[token] || ENTITY_LABEL[token.toLowerCase()] || '')
    .filter(Boolean)
    .join('');
  return translated || '';
}

function translateEntityCode(value: string) {
  const tokens = splitCodeTokens(value).map((token) => token.toLowerCase());
  if (!tokens.length) return '';
  return tokens
    .map((token) => ENTITY_LABEL[token] || ACTION_TOKEN_LABEL[token.toUpperCase()] || '')
    .filter(Boolean)
    .join('');
}

function actionLabel(a: string) {
  return ACTION_LABEL[a] || translateActionCode(a) || prettifyCodeLabel(a) || "-";
}
function entityLabel(e: string) {
  return ENTITY_LABEL[e] || translateEntityCode(e) || prettifyCodeLabel(e) || "-";
}


function formatTime(s?: string) {
  return s ? formatBeijingDateTime(s) : "-";
}
const STORAGE_KEY = 'inventory:audit-log:filters';
const persistedState = readJsonStorage(STORAGE_KEY, {
  keyword: '',
  sortBy: 'created_at',
  sortDir: 'desc',
  action: '',
  entity: '',
  entityId: '',
  user: '',
  moduleFilter: '',
  highRiskOnly: false,
  range: null as [string, string] | null,
  pageSize: getCachedSystemSettings().ui_default_page_size,
});

const rows = ref<any[]>([]);
const loading = ref(false);

const keyword = ref(String(persistedState.keyword || ""));
const sortBy = ref<string>(String(persistedState.sortBy || "created_at"));
const sortDir = ref<string>(String(persistedState.sortDir || "desc"));
const action = ref(String(persistedState.action || ""));
const entity = ref(String(persistedState.entity || ""));
const entityId = ref(String((persistedState as any).entityId || ''));
const user = ref(String(persistedState.user || ""));
const moduleFilter = ref(String((persistedState as any).moduleFilter || ""));
const highRiskOnly = ref(Boolean((persistedState as any).highRiskOnly || false));
const range = ref<any>(Array.isArray(persistedState.range) && persistedState.range.length === 2
  ? persistedState.range.map((value) => new Date(value))
  : null);

const page = ref(1);
const pageSize = ref(Number(persistedState.pageSize || getCachedSystemSettings().ui_default_page_size || 50));
const total = ref(0);

const showPayload = ref(false);
const rawPayload = ref("");
const prettyPayload = ref("");
const prettyMode = ref(true);
const activePayloadTab = ref('summary');
const currentPayloadRow = ref<any | null>(null);

const actionFilterOptions = computed(() => {
  const keys = Array.from(new Set([
    ...Object.keys(ACTION_LABEL),
    action.value,
    ...rows.value.map((row) => String(row?.action || '').trim()).filter(Boolean),
  ].filter(Boolean)));
  return keys
    .sort((a, b) => actionLabel(a).localeCompare(actionLabel(b), "zh-CN"))
    .map((k) => ({ value: k, label: actionLabel(k) }));
});

const entityFilterOptions = computed(() => {
  const keys = Array.from(new Set([
    ...Object.keys(ENTITY_LABEL),
    entity.value,
    ...rows.value.map((row) => String(row?.entity || '').trim()).filter(Boolean),
  ].filter(Boolean)));
  return keys
    .sort((a, b) => entityLabel(a).localeCompare(entityLabel(b), "zh-CN"))
    .map((k) => ({ value: k, label: entityLabel(k) }));
});
const MODULE_LABEL: Record<string, string> = {
  STOCK: '库存',
  STOCKTAKE: '盘点',
  ITEM: '配件',
  USER: '用户',
  AUDIT: '审计',
  ADMIN: '系统管理',
  PC: '电脑资产',
  MONITOR: '显示器资产',
  OTHER: '其他',
};

const moduleOptions = Object.entries(MODULE_LABEL).map(([value, label]) => ({ value, label }));

function getModuleOf(row: any) {
  const moduleCode = String(row?.module_code || '').toUpperCase();
  if (moduleCode && MODULE_LABEL[moduleCode]) return moduleCode;
  const actionCode = String(row?.action || '').toUpperCase();
  const entityCode = String(row?.entity || '').toLowerCase();
  if (actionCode.startsWith('STOCKTAKE') || entityCode.includes('stocktake')) return 'STOCKTAKE';
  if (actionCode.startsWith('STOCK_') || entityCode === 'stock' || entityCode === 'stock_tx') return 'STOCK';
  if (actionCode.startsWith('ITEM_') || entityCode === 'items') return 'ITEM';
  if (actionCode.startsWith('USER_') || entityCode === 'users') return 'USER';
  if (actionCode.startsWith('AUDIT_') || entityCode === 'audit_log') return 'AUDIT';
  if (actionCode.startsWith('ADMIN_') || entityCode === 'restore_job' || entityCode === 'backup' || entityCode === 'schema') return 'ADMIN';
  if (actionCode.startsWith('PC_') || entityCode.startsWith('pc_')) return 'PC';
  if (actionCode.startsWith('MONITOR_') || entityCode.startsWith('monitor_')) return 'MONITOR';
  return 'OTHER';
}

function isHighRiskRow(row: any) {
  if (row?.high_risk != null) return Number(row.high_risk || 0) === 1;
  const actionCode = String(row?.action || '').toUpperCase();
  return ['DELETE', 'ARCHIVE', 'SCRAP', 'ROLLBACK', 'RESET_PASSWORD', 'RESTORE', 'CLEAR'].some((token) => actionCode.includes(token));
}

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

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.length ? value.map((item) => formatAuditValue(item)).join('、') : '-';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '[对象]';
    }
  }
  return String(value);
}

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

// retention policy
const showRetention = ref(false);
const retentionDays = ref(180);
const retentionLast = ref<string | null>(null);
const retentionDaysEdit = ref(180);
const archiveEnabled = ref(false);
const archiveAfterDays = ref(90);
const deleteAfterArchive = ref(false);
const maxArchiveRows = ref(5000);
const warnDbSizeMb = ref(350);
const warnAuditRows = ref(200000);
const warnAuditBytesMb = ref(128);
const archiveLast = ref<string | null>(null);
const archiveRuns = ref<any[]>([]);
const auditWarnings = ref<Array<{ code: string; message: string }>>([]);
const auditStats = ref({ total_rows: 0, eligible_rows: 0, approx_audit_mb: 0, db_size_mb: 0 });
const runCleanup = ref(false);
const retentionSaving = ref(false);
const archiveSubmitting = ref(false);

function applyRetentionState(data: any) {
  retentionDays.value = Number(data?.retention_days || 180);
  retentionLast.value = data?.last_cleanup_at || null;
  retentionDaysEdit.value = retentionDays.value;
  archiveEnabled.value = !!data?.archive_enabled;
  archiveAfterDays.value = Number(data?.archive_after_days || 90);
  deleteAfterArchive.value = !!data?.delete_after_archive;
  maxArchiveRows.value = Number(data?.max_archive_rows || 5000);
  warnDbSizeMb.value = Number(data?.warn_db_size_mb || 350);
  warnAuditRows.value = Number(data?.warn_audit_rows || 200000);
  warnAuditBytesMb.value = Number(data?.warn_audit_bytes_mb || 128);
  archiveLast.value = data?.last_archive_at || null;
  auditWarnings.value = Array.isArray(data?.warnings) ? data.warnings : [];
  auditStats.value = {
    total_rows: Number(data?.stats?.total_rows || 0),
    eligible_rows: Number(data?.stats?.eligible_rows || 0),
    approx_audit_mb: Number(data?.stats?.approx_audit_mb || 0),
    db_size_mb: Number(data?.stats?.db_size_mb || 0),
  };
  archiveRuns.value = Array.isArray(data?.archive_runs) ? data.archive_runs : [];
}

async function loadRetention() {
  try {
    const r = await apiGet<any>("/api/admin/audit/retention");
    applyRetentionState((r as any).data || {});
  } catch {
    // ignore (non-admins etc.)
  }
}

async function openRetention() {
  runCleanup.value = false;
  await loadRetention();
  showRetention.value = true;
}

async function saveRetention() {
  try {
    retentionSaving.value = true;
    const payload: any = {
      retention_days: Number(retentionDaysEdit.value || 180),
      archive_enabled: archiveEnabled.value,
      archive_after_days: Number(archiveAfterDays.value || 90),
      delete_after_archive: deleteAfterArchive.value,
      max_archive_rows: Number(maxArchiveRows.value || 5000),
      warn_db_size_mb: Number(warnDbSizeMb.value || 350),
      warn_audit_rows: Number(warnAuditRows.value || 200000),
      warn_audit_bytes_mb: Number(warnAuditBytesMb.value || 128),
    };
    if (runCleanup.value) {
      const { value } = await ElMessageBox.prompt(
        "将删除早于保留天数的审计日志，输入“清理”确认：",
        "确认立即清理",
        { confirmButtonText: "确认", cancelButtonText: "取消", inputPlaceholder: "请输入：清理", inputValue: "" }
      );
      payload.run_cleanup = true;
      payload.confirm = value;
    }
    const r = await apiPost<any>("/api/admin/audit/retention", payload);
    ElMessage.success(runCleanup.value ? "已保存并清理" : "已保存");
    applyRetentionState((r as any).data || payload);
    runCleanup.value = false;
    showRetention.value = false;
  } catch (e: any) {
    if (e === "cancel" || e?.message === "cancel") return;
    ElMessage.error(e?.message || "保存失败");
  } finally {
    retentionSaving.value = false;
  }
}

async function createArchiveJob() {
  try {
    archiveSubmitting.value = true;
    const { value } = await ElMessageBox.prompt(
      "将生成审计归档文件，并根据策略可选删除源记录。输入“归档”确认：",
      "确认创建归档任务",
      { confirmButtonText: "确认", cancelButtonText: "取消", inputPlaceholder: "请输入：归档", inputValue: "" }
    );
    const r = await apiPost<any>("/api/admin/audit/retention", {
      retention_days: Number(retentionDaysEdit.value || 180),
      archive_enabled: archiveEnabled.value,
      archive_after_days: Number(archiveAfterDays.value || 90),
      delete_after_archive: deleteAfterArchive.value,
      max_archive_rows: Number(maxArchiveRows.value || 5000),
      warn_db_size_mb: Number(warnDbSizeMb.value || 350),
      warn_audit_rows: Number(warnAuditRows.value || 200000),
      warn_audit_bytes_mb: Number(warnAuditBytesMb.value || 128),
      run_archive: true,
      archive_confirm: value,
    });
    applyRetentionState((r as any).data || {});
    ElMessage.success(`审计归档任务已创建：#${(r as any).data?.archive_job_id || ''}`);
    showRetention.value = false;
  } catch (e: any) {
    if (e === 'cancel' || e?.message === 'cancel') return;
    ElMessage.error(e?.message || '创建归档任务失败');
  } finally {
    archiveSubmitting.value = false;
  }
}


const selectedIds = ref<number[]>([]);
const isAdmin = computed(() => can("admin"));
const canAsyncJobManage = computed(() => canCapability('system.jobs.manage'));
const route = useRoute();

function onSelect(list: any[]) {
  selectedIds.value = (list || []).map(r => Number(r.id)).filter(n => Number.isFinite(n));
}

function tagType(action: string) {
  const a = String(action || "").toUpperCase();
  if (a.includes("DELETE") || a.includes("CLEAR")) return "danger";
  if (a.includes("ROLLBACK") || a.includes("DISABLE") || a.includes("RESET")) return "warning";
  if (a.includes("STOCK_OUT") || a.includes("OUT")) return "warning";
  if (a.includes("STOCK_IN") || a.includes("IN")) return "success";
  return "info";
}

function serializeRange() {
  if (!Array.isArray(range.value) || range.value.length !== 2) return null;
  return range.value.map((value: Date | string) => new Date(value).toISOString()) as [string, string];
}

function persistState() {
  writeJsonStorage(STORAGE_KEY, {
    keyword: keyword.value || '',
    sortBy: sortBy.value || 'created_at',
    sortDir: sortDir.value || 'desc',
    action: action.value || '',
    entity: entity.value || '',
    entityId: entityId.value || '',
    user: user.value || '',
    moduleFilter: moduleFilter.value || '',
    highRiskOnly: Boolean(highRiskOnly.value),
    range: serializeRange(),
    pageSize: Number(pageSize.value || 50),
  });
}

let suppressAutoSearch = false;
let inputTimer: ReturnType<typeof setTimeout> | null = null;
let loadSeq = 0;
let loadController: AbortController | null = null;

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function clearInputTimer() {
  if (inputTimer) {
    clearTimeout(inputTimer);
    inputTimer = null;
  }
}

function scheduleSearch() {
  clearInputTimer();
  inputTimer = setTimeout(() => {
    onSearch();
  }, 320);
}

watch([keyword, action, entity, entityId, user, moduleFilter, highRiskOnly, sortBy, sortDir, pageSize], persistState);
watch(range, persistState, { deep: true });
watch(keyword, (_value, oldValue) => {
  if (suppressAutoSearch || oldValue === undefined) return;
  scheduleSearch();
});
watch(user, (_value, oldValue) => {
  if (suppressAutoSearch || oldValue === undefined) return;
  scheduleSearch();
});
watch(entityId, (_value, oldValue) => {
  if (suppressAutoSearch || oldValue === undefined) return;
  scheduleSearch();
});
watch(range, (_value, oldValue) => {
  if (suppressAutoSearch || oldValue === undefined) return;
  clearInputTimer();
  onSearch();
}, { deep: true });


function applyRouteQuery(loadAfter = true) {
  const query = route.query || {};
  const hasRouteFilters = ['keyword', 'action', 'entity', 'entity_id', 'user', 'module', 'high_risk'].some((key) => query[key] != null && String(query[key]).trim() !== '');
  if (!hasRouteFilters) return;
  suppressAutoSearch = true;
  if (query.keyword != null) keyword.value = String(query.keyword || '');
  if (query.action != null) action.value = String(query.action || '');
  if (query.entity != null) entity.value = String(query.entity || '');
  if (query.entity_id != null) entityId.value = String(query.entity_id || '');
  if (query.user != null) user.value = String(query.user || '');
  if (query.module != null) moduleFilter.value = String(query.module || '');
  if (query.high_risk != null) highRiskOnly.value = ['1', 'true', 'yes'].includes(String(query.high_risk).toLowerCase());
  page.value = 1;
  suppressAutoSearch = false;
  persistState();
  if (loadAfter) load();
}

function onSearch(){
  clearInputTimer();
  page.value = 1;
  load();
}
function onPageChange(){ load(); }
function onPageSizeChange(){ page.value = 1; load(); }

function reset(){
  suppressAutoSearch = true;
  keyword.value = "";
  action.value = "";
  entity.value = "";
  entityId.value = "";
  user.value = "";
  moduleFilter.value = "";
  highRiskOnly.value = false;
  range.value = null;
  sortBy.value = "created_at";
  sortDir.value = "desc";
  page.value = 1;
  suppressAutoSearch = false;
  clearInputTimer();
  load();
}

function tryPrettyJson(text: string){
  const t = String(text || "").trim();
  if (!t) return "";
  // Only pretty-print if it's valid JSON
  try{
    const obj = JSON.parse(t);
    return JSON.stringify(obj, null, 2);
  }catch{
    return "";
  }
}

function openPayload(row:any){
  currentPayloadRow.value = row || null;
  rawPayload.value = String(row?.payload_json || "");
  prettyPayload.value = tryPrettyJson(rawPayload.value);
  prettyMode.value = true;
  activePayloadTab.value = payloadDiffEntries.value.length ? 'diff' : 'summary';
  showPayload.value = true;
}

function focusEntityHistory(row: any) {
  if (!row?.entity_id) return;
  entity.value = row.entity || '';
  entityId.value = String(row.entity_id || '');
  page.value = 1;
  showPayload.value = false;
  load();
}

async function copyPayload(){
  const txt = payloadToCopy.value;
  if (!txt) return;
  try{
    await navigator.clipboard.writeText(txt);
    ElMessage.success("已复制");
  }catch{
    // fallback for older browsers / permissions
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

function buildAuditParams(targetPage: number, targetPageSize: number) {
  const params = new URLSearchParams();
  if (keyword.value) params.set('keyword', keyword.value);
  if (action.value) params.set('action', action.value);
  if (entity.value) params.set('entity', entity.value);
  if (entityId.value) params.set('entity_id', entityId.value);
  if (user.value) params.set('user', user.value);
  if (moduleFilter.value) params.set('module', moduleFilter.value);
  if (highRiskOnly.value) params.set('high_risk', '1');
  if (range.value?.length === 2) {
    const s = new Date(range.value[0]);
    const e = new Date(range.value[1]);
    params.set('date_from', s.toISOString().slice(0, 10));
    params.set('date_to', e.toISOString().slice(0, 10));
  }
  params.set('page', String(targetPage));
  params.set('page_size', String(targetPageSize));
  if (sortBy.value) params.set('sort_by', sortBy.value);
  if (sortDir.value) params.set('sort_dir', sortDir.value);
  return params;
}

async function createAuditExportJob(scope: 'current' | 'all') {
  const params = buildAuditParams(page.value, pageSize.value);
  const request_json: Record<string, any> = { scope, max_rows: scope === 'all' ? 5000 : undefined };
  params.forEach((v, k) => { request_json[k] = v; });
  return apiPost('/api/jobs', { job_type: 'AUDIT_EXPORT', permission_scope: 'audit_export', request_json });
}

async function fetchAuditExportRows(scope: 'current' | 'all') {
  const params = buildAuditParams(page.value, pageSize.value);
  params.set('scope', scope);
  if (scope === 'all') params.set('max_rows', '5000');
  const res: any = await apiGet(`/api/audit/export?${params.toString()}`);
  return res;
}

function buildAuditExportFilename(scope: 'current' | 'all') {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return scope === 'current' ? `audit_current_${stamp}.xlsx` : `audit_filtered_${stamp}.xlsx`;
}

function exportAuditRows(rowsToExport: any[], filename: string) {
  exportToXlsx({
    filename,
    sheetName: '审计日志',
    headers: [
      { key: 'created_at', title: '时间' },
      { key: 'username', title: '用户' },
      { key: 'module', title: '模块' },
      { key: 'action_label', title: '动作' },
      { key: 'entity_label', title: '实体' },
      { key: 'entity_id', title: '实体ID' },
      { key: 'object_name', title: '对象名称' },
    ],
    rows: rowsToExport.map((row: any) => ({
      created_at: formatTime(row.created_at),
      username: row.username || '-',
      module: MODULE_LABEL[getModuleOf(row)] || '其他',
      action_label: actionLabel(row.action),
      entity_label: entityLabel(row.entity),
      entity_id: row.entity_id ?? '-',
      object_name: row.item_name || row.user_name || '-',
    })),
  });
}

async function exportFilteredRows() {
  try {
    if (canAsyncJobManage.value) {
      await createAuditExportJob('all');
      ElMessage.success('已创建审计导出任务，请前往 系统 > 批量任务中心 下载');
      return;
    }
    const result: any = await fetchAuditExportRows('all');
    exportAuditRows(result?.data || [], buildAuditExportFilename('all'));
    ElMessage.success(result?.limited ? `已导出 ${result?.exported || 0} 条（达到上限）` : '筛选结果已导出');
  } catch (error: any) {
    ElMessage.error(error?.message || '导出筛选结果失败');
  }
}

async function exportCurrentRows() {
  try {
    if (canAsyncJobManage.value) {
      await createAuditExportJob('current');
      ElMessage.success('已创建当前页审计导出任务，请前往 系统 > 批量任务中心 下载');
      return;
    }
    const result: any = await fetchAuditExportRows('current');
    exportAuditRows(result?.data || [], buildAuditExportFilename('current'));
    ElMessage.success('当前页已导出');
  } catch (error: any) {
    ElMessage.error(error?.message || '导出当前页失败');
  }
}

async function load(){
  const currentSeq = ++loadSeq;
  loadController?.abort();
  loadController = new AbortController();
  loading.value = true;
  try{
    const params = buildAuditParams(page.value, pageSize.value);

    const j:any = await apiGet(`/api/audit/list?${params.toString()}`, { signal: loadController.signal });
    if (currentSeq !== loadSeq) return;
    rows.value = (j.data || []).map((r:any)=>({ ...r }));
    total.value = Number(j.total || 0);
  }catch(e:any){
    if (currentSeq !== loadSeq || isAbortError(e)) return;
    ElMessage.error(e.message || "加载失败");
  }finally{
    if (currentSeq === loadSeq) loading.value = false;
  }
}

async function hardConfirm(expected: string, title: string) {
  const { value } = await ElMessageBox.prompt(
    `请输入「${expected}」确认操作（区分大小写）`,
    title,
    {
      type: "warning",
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      inputPlaceholder: expected,
      inputValidator: (v: string) => (String(v || "").trim() === expected ? true : `需要输入「${expected}」`),
    }
  );
  return String(value || "").trim();
}

async function deleteOne(id: number){
  try{
    await hardConfirm("删除", "二次确认");
    await apiPost(`/api/audit/delete`, { id, confirm: "删除" });
    ElMessage.success("已删除");
    // if delete makes current page empty, go back one page.
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  }catch(e:any){
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e.message || "删除失败");
  }
}

async function deleteSelected(){
  const ids = selectedIds.value.slice();
  if (!ids.length) return;
  try{
    await ElMessageBox.confirm(`确认删除选中的 ${ids.length} 条审计日志？`, "删除确认", { type: "warning" });
    await hardConfirm("删除", "二次确认");
    await apiPost(`/api/audit/delete`, { ids, confirm: "删除" });
    ElMessage.success("已删除");
    selectedIds.value = [];
    // adjust page if needed
    if (rows.value.length <= ids.length && page.value > 1) page.value -= 1;
    await load();
  }catch(e:any){
    if (e === "cancel" || e === "close") return;
    ElMessage.error(e.message || "删除失败");
  }
}

watch(() => route.fullPath, (_value, oldValue) => {
  if (oldValue === undefined) return;
  applyRouteQuery(true);
});

onMounted(() => {
  persistState();
  if (Object.keys(route.query || {}).length) {
    applyRouteQuery(true);
    return;
  }
  load();
});
</script>

<style scoped>

.audit-retention-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}
.audit-retention-stats .stats-item{border:1px solid var(--el-border-color);border-radius:8px;padding:10px 12px;background:var(--el-fill-color-light)}
.audit-retention-stats .stats-item span{display:block;color:var(--el-text-color-secondary);font-size:12px;margin-bottom:4px}
.audit-retention-stats .stats-item b{font-size:18px}
.archive-history{margin-top:14px}
.archive-history__title{font-weight:700;margin-bottom:8px}
.archive-history__list{display:grid;gap:6px;max-height:160px;overflow:auto}
.archive-history__row{display:grid;grid-template-columns:1.4fr 1.2fr .8fr .8fr 1.6fr;gap:8px;font-size:12px;padding:8px 10px;border:1px solid var(--el-border-color-light);border-radius:6px}
.audit-header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.title{font-weight:800;font-size:16px}
.tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.audit-filters{margin-top:10px}
.entity-cell{display:flex;flex-direction:column;gap:2px;line-height:1.15}
.entity-name{font-weight:600}
.entity-meta{font-size:12px;color:#909399}
.payload-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px}.payload-summary-meta{margin-bottom:14px}.payload-kv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.payload-kv-item{padding:12px;border:1px solid var(--el-border-color);border-radius:12px;background:#fafcff}.payload-kv-label{font-size:12px;color:#909399;margin-bottom:6px}.payload-kv-value{white-space:pre-wrap;word-break:break-word}.payload-diff-list{display:flex;flex-direction:column;gap:12px}.payload-diff-item{padding:12px;border:1px solid var(--el-border-color);border-radius:12px;background:#fff}.payload-diff-key{font-weight:700;margin-bottom:10px}.payload-diff-values{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.payload-diff-cell{padding:10px;border-radius:10px}.payload-diff-cell.before{background:#fff7ed}.payload-diff-cell.after{background:#ecfdf5}.payload-diff-caption{display:inline-block;font-size:12px;color:#606266;margin-bottom:6px}.payload-diff-text{white-space:pre-wrap;word-break:break-word}.payload-box{border:1px solid var(--el-border-color);border-radius:10px}.payload-pre{margin:0;padding:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:12px;line-height:1.45;white-space:pre-wrap;word-break:break-word}@media (max-width: 900px){.payload-kv-grid,.payload-diff-values{grid-template-columns:1fr}}

</style>
