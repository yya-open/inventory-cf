<template>
  <el-card>
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap">
      <div>
        <div style="font-weight:700; font-size:16px">
          备份 / 恢复
        </div>
        <div style="color:#888; font-size:12px; margin-top:6px; line-height:1.5">
          备份文件为 JSON（支持 <b>.json.gz</b> 压缩）。
          <b>恢复属于高风险操作</b>，请谨慎。
        </div>
      </div>

      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
        <el-button
          v-if="canAdmin"
          type="warning"
          plain
          :loading="initingSchema"
          @click="initAllSchema"
        >
          管理员一键初始化全部表结构
        </el-button>
      </div>
    </div>

    <el-divider />


    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :xs="24" :md="12">
        <el-card shadow="never" style="border:1px solid #f0f0f0">
          <template #header>
            <div style="display:flex; justify-content:space-between; align-items:center">
              <span style="font-weight:700">恢复演练 SOP</span>
              <el-tag type="warning" effect="light">建议每月一次</el-tag>
            </div>
          </template>
          <ol style="margin:0; padding-left:18px; color:#666; line-height:1.8; font-size:13px">
            <li>先下载一份最新完整备份，建议启用 gzip。</li>
            <li>在隔离环境上传备份，先执行“恢复前校验”。</li>
            <li>用 merge 或 merge_upsert 模式恢复，避免直接替换生产数据。</li>
            <li>验证用户、台账、盘点、审计、字典和系统配置是否完整。</li>
            <li>记录演练结果、问题和耗时，确认恢复 SOP 可执行。</li>
          </ol>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px">
            <el-button plain @click="downloadDrillSop">下载 SOP</el-button>
            <el-button type="primary" plain @click="openDrillDialog">记录本次演练</el-button>
          </div>
          </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <LazyMountBlock title="正在装载演练记录…" min-height="280px">
          <el-card shadow="never" style="border:1px solid #f0f0f0">
            <template #header>
              <div style="display:flex; justify-content:space-between; align-items:center">
                <span style="font-weight:700">最近恢复演练</span>
              <el-button link type="primary" @click="loadBackupDrills">刷新</el-button>
            </div>
          </template>
          <div v-if="lastBackupDrillAt" style="color:#666; font-size:12px; margin-bottom:8px">最近一次：{{ lastBackupDrillAt }}</div>
          <el-table :data="backupDrills" border size="small" max-height="240">
            <el-table-column prop="drill_at" label="演练时间" width="180" />
            <el-table-column prop="outcome" label="结果" width="90" />
            <el-table-column prop="follow_up_status" label="闭环" width="110">
              <template #default="{ row }">
                <el-tag :type="row.follow_up_status === 'closed' ? 'success' : row.follow_up_status === 'open' ? 'warning' : 'info'">{{ row.follow_up_status === 'closed' ? '已闭环' : row.follow_up_status === 'open' ? '待整改' : '无需整改' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="issue_count" label="问题数" width="90" />
            <el-table-column prop="rect_owner" label="责任人" width="110" />
            <el-table-column prop="rect_due_at" label="整改截止" width="120" />
            <el-table-column prop="operator_name" label="执行人" width="110" />
            <el-table-column prop="scenario" label="场景" width="140" />
            <el-table-column prop="note" label="备注" min-width="180" show-overflow-tooltip />
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button link type="primary" @click="openDrillClosure(row)">闭环</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
        </LazyMountBlock>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col
        :xs="24"
        :md="12"
      >
        <el-card
          shadow="never"
          style="border:1px solid #f0f0f0"
        >
          <template #header>
            <div style="display:flex; justify-content:space-between; align-items:center">
              <span style="font-weight:700">导出备份</span>
              <el-tag
                type="success"
                effect="light"
              >
                推荐
              </el-tag>
            </div>
          </template>

          <div style="display:flex; flex-direction:column; gap:10px">
            <el-checkbox v-model="bk.include_tx">
              包含出入库明细（stock_tx，可能很大）
            </el-checkbox>
            <div
              v-if="bk.include_tx"
              style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; padding-left:24px"
            >
              <span style="color:#666; font-size:12px">明细时间范围：</span>
              <el-date-picker
                v-model="bk.txRange"
                type="daterange"
                unlink-panels
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                value-format="YYYY-MM-DD"
              />
              <span style="color:#999; font-size:12px">（为空则导出全部）</span>
            </div>

            <el-checkbox v-model="bk.include_stocktake">
              包含盘点（stocktake / stocktake_line）
            </el-checkbox>
            <el-checkbox v-model="bk.include_audit">
              包含审计日志（audit_log，可能很大）
            </el-checkbox>
            <div
              v-if="bk.include_audit"
              style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; padding-left:24px"
            >
              <span style="color:#666; font-size:12px">审计时间范围：</span>
              <el-date-picker
                v-model="bk.auditRange"
                type="daterange"
                unlink-panels
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                value-format="YYYY-MM-DD"
              />
              <span style="color:#999; font-size:12px">（为空则导出全部）</span>
            </div>

            <el-checkbox v-model="bk.include_throttle">
              包含登录限流（auth_login_throttle）
            </el-checkbox>

            <el-divider style="margin:8px 0" />

            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center">
              <el-switch
                v-model="bk.gzip"
                active-text="gzip 压缩（推荐）"
              />
              <div style="display:flex; align-items:center; gap:8px">
                <span style="color:#666; font-size:12px">分页大小</span>
                <el-input-number
                  v-model="bk.page_size"
                  :min="200"
                  :max="5000"
                  :step="200"
                />
              </div>
              <span style="color:#999; font-size:12px">（大数据建议 1000～2000）</span>
            </div>

            <div style="display:flex; gap:10px; flex-wrap:wrap">
              <el-button
                type="primary"
                :loading="downloading"
                @click="downloadBackup"
              >
                下载完整备份
              </el-button>
              <el-button
                :loading="downloading"
                plain
                @click="downloadTxOnly"
              >
                只下载明细
              </el-button>
              <el-button
                :loading="downloading"
                plain
                @click="downloadAuditOnly"
              >
                只下载审计
              </el-button>
            </div>

            <el-alert
              type="info"
              show-icon
              :closable="false"
            >
              建议：明细/审计单独导出，配合时间范围与分页，避免文件过大。
            </el-alert>
          </div>
        </el-card>
      </el-col>

      <el-col
        :xs="24"
        :md="12"
      >
        <el-card
          shadow="never"
          style="border:1px solid #f0f0f0"
        >
          <template #header>
            <div style="display:flex; justify-content:space-between; align-items:center">
              <span style="font-weight:700">从备份恢复</span>
              <el-tag
                type="danger"
                effect="light"
              >
                高风险
              </el-tag>
            </div>
          </template>

          <div style="display:flex; flex-direction:column; gap:12px">
            <!--
              Element Plus Upload 在不同构建/浏览器下 raw 字段偶尔为空。
              这里使用 v-model:file-list + change 事件双保险，确保选中文件后按钮可用。
            -->
            <el-upload
              ref="uploadRef"
              v-model:file-list="fileList"
              :auto-upload="false"
              :show-file-list="false"
              :limit="1"
              :on-exceed="onExceed"
              accept=".json,.gz"
              :before-upload="beforeUpload"
              :on-change="onPick"
              @change="onPick"
            >
              <el-button>选择备份（.json / .json.gz）</el-button>
            </el-upload>

            <el-alert
              v-if="pickedInfo"
              type="success"
              show-icon
              :closable="false"
            >
              已选择：{{ pickedInfo }}
            </el-alert>

            <div
              v-if="pickedInfo"
              style="margin-top:-4px; display:flex; gap:8px; align-items:center; flex-wrap:wrap"
            >
              <el-button
                size="small"
                text
                type="primary"
                @click="clearPicked"
              >
                重新选择
              </el-button>
              <el-button
                size="small"
                text
                type="warning"
                :loading="validatingRestore"
                @click="validateRestoreFile"
              >
                恢复前校验
              </el-button>
              <span
                v-if="restoreValidateAt"
                style="color:#999; font-size:12px"
              >最近校验：{{ restoreValidateAt }}</span>
            </div>

            <el-alert
              v-if="restoreValidate"
              :type="restoreValidate.valid ? 'success' : 'error'"
              show-icon
              :closable="false"
            >
              <div>
                <div>
                  校验结果：{{ restoreValidate.valid ? '通过' : '未通过' }}
                  <span style="color:#666">（错误 {{ restoreValidate.counts?.error || 0 }}，警告 {{ restoreValidate.counts?.warn || 0 }}，提示 {{ restoreValidate.counts?.info || 0 }}）</span>
                </div>
                <div
                  v-if="restoreValidatePreview.length"
                  style="margin-top:6px; color:#666; line-height:1.6"
                >
                  <div
                    v-for="(it,idx) in restoreValidatePreview"
                    :key="idx"
                  >
                    • [{{ it.severity==='error' ? '错误' : (it.severity==='warn' ? '警告' : '提示') }}] {{ it.message }}
                  </div>
                  <div
                    v-if="(restoreValidate.issues?.length || 0) > restoreValidatePreview.length"
                    style="color:#999"
                  >
                    仅显示前 {{ restoreValidatePreview.length }} 条，点击“查看校验明细”查看全部
                  </div>
                </div>
                <div style="margin-top:8px">
                  <el-button
                    size="small"
                    plain
                    @click="validateDlg=true"
                  >
                    查看校验明细
                  </el-button>
                </div>
              </div>
            </el-alert>

            <el-radio-group
              v-model="mode"
              :disabled="!!jobId && (jobStatus==='RUNNING' || jobStatus==='DONE')"
            >
              <el-radio label="merge">
                合并导入（不覆盖）
              </el-radio>
              <el-radio label="merge_upsert">
                合并覆盖（更新重复记录）
              </el-radio>
              <el-radio label="replace">
                清空并恢复（危险）
              </el-radio>
            </el-radio-group>

            <el-alert
              type="warning"
              show-icon
              :closable="false"
            >
              合并导入：尽量不覆盖现有数据（INSERT OR IGNORE）。
              <br>
              合并覆盖：遇到重复主键/唯一键时更新已有记录（UPSERT，不会先删再插，较安全）。
              <br>
              清空并恢复：会先创建恢复点快照，再清空库写入；如需回滚可用恢复点重建。
            </el-alert>

            <div style="display:flex; gap:10px; flex-wrap:wrap">
              <el-button
                type="primary"
                :disabled="!pickedFile || creatingJob"
                :loading="creatingJob"
                @click="createJob"
              >
                创建恢复任务
              </el-button>

              <el-button
                type="danger"
                :disabled="!jobId"
                :loading="running"
                @click="startOrResume"
              >
                {{ jobStatus==='PAUSED' ? '继续恢复' : (jobStatus==='RUNNING' ? '恢复中...' : '开始恢复') }}
              </el-button>

              <el-button
                :disabled="!jobId || jobStatus!=='RUNNING'"
                :loading="pausing"
                @click="pauseJob"
              >
                暂停
              </el-button>

              <el-button
                :disabled="!jobId"
                plain
                @click="refreshStatus"
              >
                刷新状态
              </el-button>
            </div>

            <el-alert
              v-if="jobId"
              type="info"
              show-icon
              :closable="false"
            >
              任务：{{ jobId }}　状态：{{ jobStatus }}　阶段：{{ jobStage }}（SNAPSHOT→SCAN→RESTORE）
              <span v-if="jobCurrentTable">　当前表：{{ jobCurrentTable }}</span>
            </el-alert>

            <div
              v-if="jobId"
              style="display:flex; flex-direction:column; gap:8px"
            >
              <el-progress
                :percentage="progressPercent"
                :status="progressStatus"
              />
              <div style="color:#666; font-size:12px; line-height:1.6">
                已处理：{{ jobProcessed }} / {{ jobTotal || '计算中...' }} 行
                <span
                  v-if="jobLastError"
                  style="color:#d33"
                >　错误：{{ jobLastError }}</span>
              </div>
            </div>

            <el-alert
              v-if="jobStatus==='DONE'"
              type="success"
              show-icon
              :closable="false"
            >
              恢复完成 ✅
            </el-alert>


            <!-- 恢复完成后仅通过弹窗查看明细，避免页面内容过长且保持风格一致 -->
            <div
              v-if="jobStatus==='DONE' && restoreDetailRows.length"
              style="margin-top:10px"
            >
              <el-button
                type="primary"
                plain
                size="small"
                @click="detailDlg=true"
              >
                查看本次恢复明细
              </el-button>
            </div>


            <el-alert
              v-if="jobStatus==='FAILED'"
              type="error"
              show-icon
              :closable="false"
            >
              恢复失败：{{ jobLastError || '未知错误' }}
            </el-alert>
          </div>
        
          <el-dialog
            v-model="validateDlg"
            title="恢复前校验结果"
            width="980px"
            :append-to-body="true"
          >
            <div style="display:flex; flex-direction:column; gap:10px">
              <el-alert
                v-if="restoreValidate"
                :type="restoreValidate.valid ? 'success' : 'error'"
                show-icon
                :closable="false"
              >
                错误：{{ restoreValidate.counts?.error || 0 }}，警告：{{ restoreValidate.counts?.warn || 0 }}，提示：{{ restoreValidate.counts?.info || 0 }}
              </el-alert>

              <div
                v-if="restoreValidateIssues.length"
                style="display:flex; flex-direction:column; gap:12px"
              >
                <div
                  v-for="g in restoreValidateIssueGroups"
                  :key="g.key"
                  style="border:1px solid #ebeef5; border-radius:8px; padding:10px; background:#fff"
                >
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
                    <div style="font-weight:600">
                      {{ g.label }}
                    </div>
                    <div style="color:#666; font-size:12px">
                      共 {{ g.rows.length }} 项 ｜ 错误 {{ g.countError }} ｜ 警告 {{ g.countWarn }} ｜ 提示 {{ g.countInfo }}
                    </div>
                  </div>
                  <el-table
                    :data="g.rows"
                    size="small"
                    border
                    style="width:100%"
                  >
                    <el-table-column
                      label="级别"
                      width="80"
                    >
                      <template #default="{row}">
                        <el-tag
                          size="small"
                          :type="row.severity==='error' ? 'danger' : (row.severity==='warn' ? 'warning' : 'info')"
                        >
                          {{ row.severity==='error' ? '错误' : (row.severity==='warn' ? '警告' : '提示') }}
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column
                      label="表"
                      min-width="190"
                    >
                      <template #default="{row}">
                        <div style="display:flex; flex-direction:column; line-height:1.2">
                          <span style="font-weight:600">{{ row.table ? tableCn(row.table) : '（未指定表）' }}</span>
                          <span style="color:#999; font-size:12px">{{ row.table || '-' }}</span>
                        </div>
                      </template>
                    </el-table-column>
                    <el-table-column
                      prop="column"
                      label="字段"
                      width="160"
                    />
                    <el-table-column
                      prop="message"
                      label="说明"
                      min-width="360"
                    />
                  </el-table>
                </div>
              </div>

              <el-alert
                v-else
                type="success"
                :closable="false"
                show-icon
              >
                未发现表/字段差异问题。
              </el-alert>
            </div>
            <template #footer>
              <el-button @click="validateDlg=false">
                关闭
              </el-button>
            </template>
          </el-dialog>
  <el-dialog v-model="drillClosureDialog" title="更新演练闭环" width="560px">
    <el-form label-width="96px">
      <el-form-item label="场景"><el-input v-model="drillClosureForm.scenario" /></el-form-item>
      <el-form-item label="结果">
        <el-select v-model="drillClosureForm.outcome" style="width:100%">
          <el-option label="成功" value="success" />
          <el-option label="警告" value="warn" />
          <el-option label="失败" value="failed" />
        </el-select>
      </el-form-item>
      <el-form-item label="问题数"><el-input-number v-model="drillClosureForm.issue_count" :min="0" :max="99" style="width:100%" /></el-form-item>
      <el-form-item label="闭环状态">
        <el-select v-model="drillClosureForm.follow_up_status" style="width:100%">
          <el-option label="无需整改" value="not_required" />
          <el-option label="待整改" value="open" />
          <el-option label="已闭环" value="closed" />
        </el-select>
      </el-form-item>
      <el-form-item label="责任人"><el-input v-model="drillClosureForm.rect_owner" /></el-form-item>
      <el-form-item label="整改截止"><el-date-picker v-model="drillClosureForm.rect_due_at" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
      <el-form-item label="备注"><el-input v-model="drillClosureForm.note" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
      <el-form-item label="复盘结论"><el-input v-model="drillClosureForm.review_note" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="drillClosureDialog=false">取消</el-button>
      <el-button type="primary" @click="saveDrillClosure">保存闭环</el-button>
    </template>
  </el-dialog>

          <el-dialog
            v-model="detailDlg"
            title="本次恢复明细"
            width="860px"
            :append-to-body="true"
          >
            <div style="color:#666; font-size:12px; margin-bottom:10px">
              涉及表：{{ affectedTablesText }}
            </div>
            <div style="display:flex; flex-direction:column; gap:12px">
              <div
                v-for="g in restoreDetailGroups"
                :key="g.key"
                style="border:1px solid #ebeef5; border-radius:8px; padding:10px; background:#fff"
              >
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
                  <div style="font-weight:600">
                    {{ g.label }}
                  </div>
                  <div style="color:#666; font-size:12px">
                    表数 {{ g.rows.length }} ｜ 已处理 {{ g.sumProcessed }} ｜ 写入变更 {{ g.sumWritten }}
                  </div>
                </div>
                <el-table
                  :data="g.rows"
                  size="small"
                  border
                  style="width:100%"
                >
                  <el-table-column
                    label="表"
                    min-width="220"
                  >
                    <template #default="{row}">
                      <div style="display:flex; flex-direction:column; line-height:1.2">
                        <span style="font-weight:600">{{ row.table_cn }}</span>
                        <span style="color:#999; font-size:12px">{{ row.table }}</span>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column
                    label="备份行数"
                    width="110"
                  >
                    <template #default="{row}">
                      <span v-if="row.in_backup">{{ row.total }}</span>
                      <span
                        v-else
                        style="color:#999"
                      >—</span>
                    </template>
                  </el-table-column>
                  <el-table-column
                    prop="processed"
                    label="已处理"
                    width="90"
                  />
                  <el-table-column
                    prop="written"
                    label="写入变更"
                    width="100"
                  />
                  <el-table-column
                    prop="skipped"
                    label="未写入(可能重复)"
                    width="140"
                  />
                </el-table>
              </div>
            </div>

            <el-alert
              type="info"
              show-icon
              :closable="false"
              style="margin-top:12px"
            >
              说明：合并导入时，重复主键会被忽略，因此“写入变更”可能小于“已处理”。
            </el-alert>

            <template #footer>
              <el-button @click="detailDlg=false">
                关闭
              </el-button>
            </template>
          </el-dialog>
        </el-card>
      </el-col>
    </el-row>
  <el-dialog v-model="drillDialog" title="记录恢复演练" width="560px">
    <el-form label-width="90px">
      <el-form-item label="场景"><el-input v-model="drillForm.scenario" placeholder="restore_drill / validate_only" /></el-form-item>
      <el-form-item label="结果">
        <el-select v-model="drillForm.outcome" style="width:100%">
          <el-option label="成功" value="success" />
          <el-option label="警告" value="warn" />
          <el-option label="失败" value="failed" />
        </el-select>
      </el-form-item>
      <el-form-item label="问题数"><el-input-number v-model="drillForm.issue_count" :min="0" :max="99" style="width:100%" /></el-form-item>
      <el-form-item label="闭环状态">
        <el-select v-model="drillForm.follow_up_status" style="width:100%">
          <el-option label="无需整改" value="not_required" />
          <el-option label="待整改" value="open" />
          <el-option label="已闭环" value="closed" />
        </el-select>
      </el-form-item>
      <el-form-item label="责任人"><el-input v-model="drillForm.rect_owner" placeholder="整改责任人" /></el-form-item>
      <el-form-item label="整改截止"><el-date-picker v-model="drillForm.rect_due_at" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
      <el-form-item label="备注"><el-input v-model="drillForm.note" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
      <el-form-item label="复盘结论"><el-input v-model="drillForm.review_note" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="drillDialog=false">取消</el-button>
      <el-button type="primary" @click="saveBackupDrill">保存</el-button>
    </template>
  </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ElUpload } from 'element-plus';
import { ElDivider, ElProgress, ElRadio, ElRadioGroup } from 'element-plus';
import { ref, computed, watch, onMounted } from "vue";
import { ElMessageBox } from "../utils/el-services";
import { msgError, msgSuccess, msgWarn } from "../utils/msg";
import { apiDownload, apiPostForm, apiGet, apiPost, apiPut } from "../api/client";
import { formatBeijingNowDateTime } from "../utils/datetime";
import { scheduleOnIdle } from '../utils/idle';
import { can } from "../store/auth";
import LazyMountBlock from "../components/LazyMountBlock.vue";

const bk = ref({
  include_tx: false,
  include_stocktake: false,
  include_audit: false,
  include_throttle: false,

  // 大数据导出优化
  gzip: true,
  page_size: 1000,

  // YYYY-MM-DD
  txRange: [] as string[] | [],
  auditRange: [] as string[] | [],
});

const downloading = ref(false);

const canAdmin = computed(() => can("admin"));
const initingSchema = ref(false);

async function initAllSchema() {
  try {
    const { value } = await ElMessageBox.prompt(
      "将创建/补齐所有业务表结构（含电脑仓/显示器/盘点/限流/恢复任务等）。请输入：初始化",
      "二次确认",
      {
        confirmButtonText: "开始初始化",
        cancelButtonText: "取消",
        inputPlaceholder: "初始化",
      }
    );
    if (String(value || "").trim() !== "初始化") {
      msgWarn("确认文字不正确");
      return;
    }
    initingSchema.value = true;
    await apiPost("/api/admin/init_schema", { confirm: "初始化" });
    msgSuccess("初始化完成");
  } catch (e: any) {
    if (e?.message && String(e.message).includes("cancel")) return;
    msgError(e?.message || "初始化失败");
  } finally {
    initingSchema.value = false;
  }
}


const detailDlg = ref(false);
const detailDlgAutoOpened = ref(false);
const validateDlg = ref(false);
const validatingRestore = ref(false);
const restoreValidate = ref<any>(null);
const restoreValidateAt = ref<string>("");
function buildBackupQuery(extra?: Record<string, string>) {
  const q = new URLSearchParams();
  if (bk.value.include_tx) q.set("include_tx", "1");
  if (bk.value.include_stocktake) q.set("include_stocktake", "1");
  if (bk.value.include_audit) q.set("include_audit", "1");
  if (bk.value.include_throttle) q.set("include_throttle", "1");

  // gzip / pagination
  if (bk.value.gzip) q.set("gzip", "1");
  q.set("page_size", String(bk.value.page_size || 1000));

  // time ranges for big tables
  if (bk.value.include_tx && Array.isArray(bk.value.txRange) && bk.value.txRange.length === 2) {
    q.set("tx_since", bk.value.txRange[0]);
    q.set("tx_until", bk.value.txRange[1]);
  }
  if (bk.value.include_audit && Array.isArray(bk.value.auditRange) && bk.value.auditRange.length === 2) {
    q.set("audit_since", bk.value.auditRange[0]);
    q.set("audit_until", bk.value.auditRange[1]);
  }

  if (extra) {
    Object.entries(extra).forEach(([k, v]) => q.set(k, v));
  }
  q.set("download", "1");
  return q;
}

async function downloadBackup() {
  downloading.value = true;
  try {
    const q = buildBackupQuery();
    const fname = bk.value.gzip ? "inventory_backup.json.gz" : "inventory_backup.json";
    await apiDownload(`/api/admin/backup?${q.toString()}`, fname);
    msgSuccess("备份已下载");
  } catch (e:any) {
    msgError(e?.message || "下载失败");
  } finally {
    downloading.value = false;
  }
}

async function downloadTxOnly() {
  downloading.value = true;
  try {
    const q = buildBackupQuery({ table: "stock_tx" });
    const fname = bk.value.gzip ? "inventory_stock_tx.json.gz" : "inventory_stock_tx.json";
    await apiDownload(`/api/admin/backup?${q.toString()}`, fname);
    msgSuccess("明细已下载");
  } catch (e:any) {
    msgError(e?.message || "下载失败");
  } finally {
    downloading.value = false;
  }
}

async function downloadAuditOnly() {
  downloading.value = true;
  try {
    const q = buildBackupQuery({ table: "audit_log" });
    const fname = bk.value.gzip ? "inventory_audit_log.json.gz" : "inventory_audit_log.json";
    await apiDownload(`/api/admin/backup?${q.toString()}`, fname);
    msgSuccess("审计已下载");
  } catch (e:any) {
    msgError(e?.message || "下载失败");
  } finally {
    downloading.value = false;
  }
}

// 选中文件（Upload 组件有时 raw 为空，用 fileList 双保险）
const fileList = ref<any[]>([]);
const pickedFile = ref<File | null>(null);
const pickedInfo = ref<string>("");

// Upload 实例：用于 limit=1 时自动替换/清空，确保重复选择能触发更新
const uploadRef = ref<any>(null);

function clearPicked() {
  pickedFile.value = null;
  pickedInfo.value = "";
  fileList.value = [];
  restoreValidate.value = null;
  restoreValidateAt.value = "";
  try { uploadRef.value?.clearFiles?.(); } catch {}
}

function onExceed(files: File[]) {
  // 当再次选择文件时，limit=1 会触发 exceed：这里自动替换旧文件并刷新显示
  clearPicked();
  if (files && files[0]) {
    // 用原生 File 直接更新
    onPick(files[0]);
  }
}

function beforeUpload() {
  // 阻止组件自动上传，我们只在“创建恢复任务”时提交表单
  return false;
}

async function onPick(uploadFile: any) {
  // uploadFile 可能是 UploadFile，也可能是原生事件，这里尽量兼容
  const file: File | undefined = uploadFile?.raw || uploadFile?.file || uploadFile;
  if (!file || typeof file.name !== "string") return;
  pickedFile.value = file;

  // 同步 fileList（用于 v-model:file-list 兜底；包含 raw，便于后续 watch/替换）
  fileList.value = [{ name: file.name, raw: file }];

  const mb = (file.size / 1024 / 1024).toFixed(2);
  pickedInfo.value = `${file.name}（${mb} MB）`;
  restoreValidate.value = null;
  restoreValidateAt.value = "";
  msgSuccess("已选择备份文件");
}

// 有些情况下 change 回调拿不到 raw，但 v-model:file-list 能拿到，做一次兜底
watch(fileList, (list) => {
  const f = list?.[0]?.raw as File | undefined;
  if (f && (!pickedFile.value || pickedFile.value.name !== f.name || pickedFile.value.size !== f.size)) {
    pickedFile.value = f;
    const mb = (f.size / 1024 / 1024).toFixed(2);
    pickedInfo.value = `${f.name}（${mb} MB）`;
  }
});

const mode = ref<"merge"|"merge_upsert"|"replace">("merge");

const creatingJob = ref(false);
const jobId = ref<string>("");
const jobStatus = ref<string>("");
const jobStage = ref<string>("");
const jobTotal = ref<number>(0);
const jobProcessed = ref<number>(0);
const jobCurrentTable = ref<string>("");
const jobLastError = ref<string>("");
const jobMode = ref<string>("");
const jobPerTable = ref<any>({});

const running = ref(false);
const pausing = ref(false);

const progressPercent = computed(() => {
  if (!jobTotal.value) return 0;
  const p = Math.floor((jobProcessed.value / jobTotal.value) * 100);
  return Math.max(0, Math.min(100, p));
});

const progressStatus = computed(() => {
  if (jobStatus.value === "FAILED") return "exception";
  if (jobStatus.value === "DONE") return "success";
  return undefined as any;
});


const TABLE_LABEL: Record<string, string> = {
  warehouses: "仓库",
  items: "配件",
  stock: "stock",
  categories: "分类",
  stock_tx: "出入库明细",
  stocktake: "盘点单",
  stocktake_line: "盘点明细",
  audit_log: "审计日志",
  auth_login_throttle: "登录限流",
  public_api_throttle: "公共接口限流",
  users: "用户",
  pc_assets: "电脑台账",
  pc_in: "电脑入库记录",
  pc_out: "电脑出库记录",
  pc_recycle: "电脑回收/归还记录",
  pc_scrap: "电脑报废记录",
  pc_inventory_log: "电脑盘点记录",
  pc_locations: "位置表",
  monitor_assets: "显示器台账",
  monitor_tx: "显示器出入库明细",
  monitor_inventory_log: "显示器盘点记录",
};

function tableCn(t: string) {
  return TABLE_LABEL[t] || t;
}


function tableGroupKey(t: string) {
  if (["warehouses","items","categories","stock","stock_tx","stocktake","stocktake_line"].includes(t)) return "parts";
  if (t.startsWith("pc_")) return "pc";
  if (t.startsWith("monitor_") || ["monitor_assets","monitor_tx","monitor_inventory_log"].includes(t)) return "monitor";
  return "system";
}
function tableGroupLabel(key: string) {
  return key === "parts" ? "配件仓" : (key === "pc" ? "电脑仓" : (key === "monitor" ? "显示器" : "系统表"));
}

const restoreDetailRows = computed(() => {

  const pt = jobPerTable.value || {};
  const order: string[] = Array.isArray(pt.__order__) ? pt.__order__ : [];
  const present = (pt.__present__ && typeof pt.__present__ === "object") ? pt.__present__ : {};
  const processed = (pt.__processed__ && typeof pt.__processed__ === "object") ? pt.__processed__ : {};
  const inserted = (pt.__inserted__ && typeof pt.__inserted__ === "object") ? pt.__inserted__ : {};

  // Ensure all known tables are listed (even 0 rows) so user can see what's missing.
  const all = Object.keys(TABLE_LABEL);
  const seen = new Set<string>();
  const list: string[] = [];
  for (const t of order) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    list.push(t);
  }
  for (const t of all) {
    if (!seen.has(t)) {
      seen.add(t);
      list.push(t);
    }
  }

  return list
    .map((t) => {
      const in_backup = Boolean(present[t]);
      const total = in_backup ? Number(pt[t] || 0) : 0;
      const p = Number(processed[t] || 0);
      const w = Number(inserted[t] || 0);
      return {
        table: t,
        table_cn: tableCn(t),
        in_backup,
        total,
        processed: p,
        written: w,
        skipped: Math.max(0, p - w),
      };
    });
});

const restoreDetailGroups = computed(() => {
  const grouped = new Map<string, any[]>();
  for (const row of restoreDetailRows.value) {
    const key = tableGroupKey(row.table);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }
  const order = ["parts", "pc", "monitor", "system"];
  return order
    .filter((k) => grouped.has(k))
    .map((k) => {
      const rows = grouped.get(k)!;
      return {
        key: k,
        label: tableGroupLabel(k),
        rows,
        sumProcessed: rows.reduce((n, r) => n + Number(r.processed || 0), 0),
        sumWritten: rows.reduce((n, r) => n + Number(r.written || 0), 0),
      };
    });
});

const affectedTablesText = computed(() => {
  const names = restoreDetailRows.value
    .filter((r) => r.processed > 0)
    .map((r) => r.table_cn);
  return names.length ? names.join("、") : "（无）";
});

const restoreValidateIssues = computed(() => Array.isArray(restoreValidate.value?.issues) ? restoreValidate.value.issues : []);
const restoreValidatePreview = computed(() => restoreValidateIssues.value.slice(0, 6));
const restoreValidateIssueGroups = computed(() => {
  const grouped = new Map<string, any[]>();
  for (const row of restoreValidateIssues.value) {
    const t = String(row?.table || "");
    const key = t ? tableGroupKey(t) : "system";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }
  const order = ["parts", "pc", "monitor", "system"];
  return order.filter((k) => grouped.has(k)).map((k) => {
    const rows = grouped.get(k)!;
    return {
      key: k,
      label: tableGroupLabel(k),
      rows,
      countError: rows.filter((r) => r?.severity === "error").length,
      countWarn: rows.filter((r) => r?.severity === "warn").length,
      countInfo: rows.filter((r) => r?.severity === "info").length,
    };
  });
});




watch([jobStatus, restoreDetailRows], () => {
  if (jobStatus.value === "DONE" && restoreDetailRows.value.length && !detailDlgAutoOpened.value) {
    detailDlg.value = true;
    detailDlgAutoOpened.value = true;
  }
});

async function validateRestoreFile(opts?: { silent?: boolean }) {
  if (!pickedFile.value) {
    if (!opts?.silent) msgWarn("请先选择备份文件");
    return null;
  }
  validatingRestore.value = true;
  try {
    const form = new FormData();
    form.set("file", pickedFile.value);
    const r = await apiPostForm<any>("/api/admin/restore_validate", form);
    restoreValidate.value = r.data;
    restoreValidateAt.value = formatBeijingNowDateTime();
    if (!opts?.silent) {
      if (r.data?.valid) msgSuccess("恢复前校验通过");
      else msgWarn("恢复前校验未通过，请先处理错误项");
    }
    return r.data;
  } catch (e:any) {
    if (!opts?.silent) msgError(e?.message || "恢复前校验失败");
    throw e;
  } finally {
    validatingRestore.value = false;
  }
}

async function createJob() {
  if (!pickedFile.value) return;
  detailDlgAutoOpened.value = false;

  let v = restoreValidate.value;
  if (!v) {
    v = await validateRestoreFile({ silent: true }).catch(() => null);
  }
  if (v && v.valid === false) {
    validateDlg.value = true;
    msgWarn("恢复前校验未通过，请先处理错误项");
    return;
  }

  const expected = mode.value === "replace" ? "清空并恢复" : (mode.value === "merge_upsert" ? "覆盖导入" : "恢复");
  try {
    const { value: confirmText } = await ElMessageBox.prompt(
      mode.value === "replace"
        ? "将先自动创建恢复点快照，再清空数据库恢复。请输入：清空并恢复"
        : (mode.value === "merge_upsert"
            ? "将导入备份数据并更新重复记录（覆盖同主键/唯一键）。请输入：覆盖导入"
            : "将先自动创建恢复点快照，再导入备份数据。请输入：恢复"),
      "二次确认",
      {
        confirmButtonText: "创建任务",
        cancelButtonText: "取消",
        inputPlaceholder: expected,
        inputValue: "",
        type: "warning",
      }
    ).catch(() => ({ value: "" } as any));

    if (String(confirmText || "").trim() !== expected) {
      msgWarn("二次确认未通过，已取消");
      return;
    }

    creatingJob.value = true;
    const form = new FormData();
    form.set("mode", mode.value);
    form.set("confirm", expected);
    form.set("file", pickedFile.value);

    const r = await apiPostForm<any>("/api/admin/restore_job/create", form);
    jobId.value = r.data.id;
    msgSuccess("任务已创建");
    await refreshStatus();
  } catch (e:any) {
    msgError(e?.message || "创建任务失败");
  } finally {
    creatingJob.value = false;
  }
}

async function refreshStatus() {
  if (!jobId.value) return;
  try {
    const r = await apiGet<any>(`/api/admin/restore_job/status?id=${encodeURIComponent(jobId.value)}`);
    const d = r.data;
    jobStatus.value = d.status || "";
    jobStage.value = d.stage || "";
    jobMode.value = d.mode || "";
    jobPerTable.value = d.per_table || {};
    jobTotal.value = Number(d.total_rows || 0);
    jobProcessed.value = Number(d.processed_rows || 0);
    jobCurrentTable.value = d.current_table || "";
    jobLastError.value = d.last_error || "";
  } catch (e:any) {
    msgError(e?.message || "刷新失败");
  }
}

function stopLoop() {
  running.value = false;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function startOrResume() {
  if (!jobId.value) {
    msgWarn("请先创建恢复任务");
    return;
  }
  if (running.value) return;

  running.value = true;
  try {
    while (running.value) {
      const r = await apiPost<any>("/api/admin/restore_job/run", {
        id: jobId.value,
        max_rows: 2000,
        max_ms: 8000,
      });

      await refreshStatus();

      const st = jobStatus.value;
      const more = Boolean(r.data.more);

      if (st === "DONE" || st === "FAILED" || st === "PAUSED" || st === "CANCELED") {
        stopLoop();
        return;
      }

      await sleep(more ? 150 : 1000);
    }
  } catch (e:any) {
    stopLoop();
    msgError(e?.message || "运行失败");
    await refreshStatus();
  }
}

async function pauseJob() {
  if (!jobId.value) return;
  pausing.value = true;
  try {
    await apiPost("/api/admin/restore_job/cancel", { id: jobId.value });
    await refreshStatus();
    stopLoop();
    msgSuccess("已暂停，可稍后继续");
  } catch (e:any) {
    msgError(e?.message || "暂停失败");
  } finally {
    pausing.value = false;
  }
}


type BackupDrillRow = { id:number; drill_at:string; outcome:string; scenario:string; operator_name?:string; note?:string; issue_count?: number; follow_up_status?: 'open' | 'closed' | 'not_required'; rect_owner?: string; rect_due_at?: string; rect_closed_at?: string; review_note?: string };
const backupDrills = ref<BackupDrillRow[]>([]);
const lastBackupDrillAt = ref('');
const drillDialog = ref(false);
const drillClosureDialog = ref(false);
const drillForm = ref({ scenario: 'restore_drill', outcome: 'success', note: '', issue_count: 0, follow_up_status: 'not_required', rect_owner: '', rect_due_at: '', review_note: '' });
const drillClosureForm = ref<any>({ id: 0, scenario: 'restore_drill', outcome: 'success', note: '', issue_count: 0, follow_up_status: 'not_required', rect_owner: '', rect_due_at: '', review_note: '' });

function downloadDrillSop() {
  const content = [
    '备份/恢复演练 SOP',
    '',
    '1. 下载最新完整备份（推荐 gzip）。',
    '2. 在隔离环境导入备份文件并执行恢复前校验。',
    '3. 采用 merge 或 merge_upsert 模式恢复。',
    '4. 验证用户、电脑台账、显示器台账、盘点、审计日志、系统配置。',
    '5. 记录演练时间、结果、问题、恢复耗时。',
  ].join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'backup_restore_drill_sop.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function openDrillDialog() {
  drillDialog.value = true;
}

function openDrillClosure(row: BackupDrillRow) {
  drillClosureForm.value = {
    id: row.id,
    scenario: row.scenario || 'restore_drill',
    outcome: row.outcome || 'success',
    note: row.note || '',
    issue_count: Number(row.issue_count || 0),
    follow_up_status: row.follow_up_status || 'not_required',
    rect_owner: row.rect_owner || '',
    rect_due_at: row.rect_due_at || '',
    review_note: row.review_note || '',
  };
  drillClosureDialog.value = true;
}

async function loadBackupDrills() {
  try {
    const r:any = await apiGet('/api/backup-drills');
    backupDrills.value = Array.isArray(r.data) ? r.data : [];
    lastBackupDrillAt.value = backupDrills.value[0]?.drill_at || '';
  } catch {}
}

async function saveBackupDrill() {
  try {
    await apiPost('/api/backup-drills', drillForm.value);
    msgSuccess('演练记录已保存');
    drillDialog.value = false;
    drillForm.value = { scenario: 'restore_drill', outcome: 'success', note: '', issue_count: 0, follow_up_status: 'not_required', rect_owner: '', rect_due_at: '', review_note: '' };
    await loadBackupDrills();
  } catch (e:any) {
    msgError(e?.message || '保存演练记录失败');
  }
}

async function saveDrillClosure() {
  try {
    await apiPut('/api/backup-drills', drillClosureForm.value);
    msgSuccess('演练闭环已更新');
    drillClosureDialog.value = false;
    await loadBackupDrills();
  } catch (e:any) {
    msgError(e?.message || '更新演练闭环失败');
  }
}

onMounted(() => {
  scheduleOnIdle(() => {
    loadBackupDrills().catch(() => undefined);
  }, 1200);
});

</script>
