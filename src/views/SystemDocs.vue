<template>
  <div class="sys-page docs-grid">
    <el-card shadow="never" class="sys-rounded-card">
      <template #header>
        <div class="sys-header-row">
          <div>
            <div class="sys-title-strong docs-title">系统交付文档</div>
            <div class="sys-muted">把发布顺序、迁移顺序、修复中心按钮和常见异常处理集中在一个页面，便于交接和长期维护。</div>
          </div>
          <div class="sys-actions-row">
            <el-button size="small" @click="go('/system/release-check')">打开发布前检查</el-button>
            <el-button size="small" @click="go('/system/tools')">打开运维工具</el-button>
            <el-button size="small" @click="go('/system/backup')">打开备份/恢复</el-button>
          </div>
        </div>
      </template>

      <el-row :gutter="12">
        <el-col :xs="24" :md="12">
          <el-card shadow="never" class="doc-card">
            <div class="doc-title">上线顺序</div>
            <ol class="doc-list">
              <li>先执行 <code>npm run verify:release</code></li>
              <li>确认发布前检查为绿色</li>
              <li>先跑远程迁移，再部署新代码</li>
              <li>部署后进入运维工具看自动巡检是否全绿</li>
            </ol>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-card shadow="never" class="doc-card">
            <div class="doc-title">常用命令</div>
            <pre class="cmd">npm run verify:release
npm run migrate:status -- --db inventory_db --remote
npm run migrate:apply -- --db inventory_db --remote</pre>
          </el-card>
        </el-col>
      </el-row>
    </el-card>

    <el-card shadow="never" class="sys-rounded-card">
      <template #header><div class="sys-title-strong">修复中心按钮说明</div></template>
      <el-table :data="repairDocs" border size="small">
        <el-table-column prop="name" label="按钮" width="180" />
        <el-table-column prop="effect" label="做什么" min-width="280" />
        <el-table-column prop="risk" label="影响 / 风险" min-width="220" />
        <el-table-column prop="when" label="什么时候点" min-width="220" />
      </el-table>
    </el-card>

    <el-card shadow="never" class="sys-rounded-card">
      <template #header><div class="sys-title-strong">高风险操作统一规范</div></template>
      <el-steps :active="4" finish-status="success" simple>
        <el-step title="先预检" description="先看影响条数和差异" />
        <el-step title="再确认" description="确认操作不可逆 / 可重建" />
        <el-step title="执行" description="记录审计和修复历史" />
        <el-step title="复扫" description="执行后马上再扫描" />
      </el-steps>
      <div class="docs-help-block">
        建议所有高风险动作都遵循同一套交互：先给出预检结果，再确认影响，再执行，最后立即刷新健康状态，避免用户在不同页面遇到完全不同的操作方式。
      </div>
    </el-card>

    <el-card shadow="never" class="sys-rounded-card">
      <template #header><div class="sys-title-strong">常见异常处理</div></template>
      <el-collapse>
        <el-collapse-item title="页面提示 Schema 未就绪 / no such column" name="schema">
          先到发布前检查看当前数据库版本和代码要求版本是否一致；不一致时，先执行远程迁移，再刷新页面。
        </el-collapse-item>
        <el-collapse-item title="运维工具扫描有问题但修复后仍提示异常" name="repair">
          先再次点击“先扫描”；若仍存在，优先看差异明细，再决定是重跑单项修复，还是进一步核对 SQL / 数据口径。
        </el-collapse-item>
        <el-collapse-item title="异步任务失败" name="jobs">
          先看失败原因摘要；确认不是权限/Schema 问题后，再点重试。超过最大重试次数时，建议先处理根因再重建任务。
        </el-collapse-item>
        <el-collapse-item title="误删 / 需要恢复" name="restore">
          先查看最近备份和恢复演练 SOP；恢复前先在测试环境或恢复演练流程中走一遍，避免直接覆盖线上数据。
        </el-collapse-item>
      </el-collapse>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ElCollapse, ElCollapseItem, ElStep, ElSteps } from 'element-plus';
import { useRouter } from 'vue-router';

const router = useRouter();
const go = (path: string) => router.push(path);

const repairDocs = [
  { name: '先扫描', effect: '读取或刷新最新巡检结果，识别快照、字典计数、审计物化、搜索规范化异常。', risk: '只读，无业务风险。', when: '任何修复动作前先点一次。' },
  { name: '一键全量修复', effect: '按固定顺序依次执行所有修复动作，并在结束后自动复扫。', risk: '会批量写入派生数据，建议避开高峰期。', when: '多类问题同时存在时。' },
  { name: '重建电脑快照', effect: '重算所有电脑的最新状态快照。', risk: '只影响快照表，不直接改业务原始流水。', when: '电脑快照缺失或状态显示异常时。' },
  { name: '重算字典引用', effect: '重建品牌 / 部门 / 归档原因引用计数。', risk: '只影响计数表。', when: '字典引用计数不一致时。' },
  { name: '回填审计物化', effect: '重算模块、高风险、对象名称、摘要、搜索字段。', risk: '只影响 audit_log 的派生字段。', when: '审计列表展示、搜索、导出不一致时。' },
  { name: '重建搜索规范化', effect: '重建电脑/显示器的 search_text_norm。', risk: '只影响搜索辅助字段。', when: '搜索结果明显漏数据时。' },
];
</script>

<style scoped>
.docs-grid {
  display: grid;
  gap: 12px;
}

.docs-title {
  font-size: 16px;
}

.docs-help-block {
  margin-top: 12px;
  color: #666;
  line-height: 1.8;
}

.doc-card {
  border-radius: 12px;
  height: 100%;
}
.doc-title {
  font-weight: 700;
  margin-bottom: 10px;
}
.doc-list {
  margin: 0;
  padding-left: 18px;
  color: #555;
  line-height: 1.9;
}
.cmd {
  margin: 0;
  padding: 12px 14px;
  background: #f7f8fa;
  border-radius: 10px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.7;
}
</style>
