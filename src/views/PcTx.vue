<template>
  <el-card>
    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px">
      <el-select v-model="type" placeholder="类型" clearable style="width:140px" @change="onSearch">
        <el-option label="入库(IN)" value="IN" />
        <el-option label="出库(OUT)" value="OUT" />
        <el-option label="归还(RETURN)" value="RETURN" />
        <el-option label="回收(RECYCLE)" value="RECYCLE" />
      </el-select>

      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="到"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
      />

      <el-input v-model="keyword" clearable placeholder="关键词：单号/序列号/员工/部门/品牌/型号" style="width: 260px" @keyup.enter="onSearch" />

      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button @click="reset">重置</el-button>

      <el-button type="info" plain @click="$router.push('/pc/assets')">返回台账</el-button>
    </div>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="created_at" label="时间" width="170" />
      <el-table-column prop="tx_no" label="单号" width="210" />
      <el-table-column prop="type" label="类型" width="110">
        <template #default="{row}">
          <el-tag v-if="row.type==='IN'" type="success">入库</el-tag>
          <el-tag v-else-if="row.type==='OUT'" type="danger">出库</el-tag>
          <el-tag v-else-if="row.type==='RETURN'" type="warning">归还</el-tag>
          <el-tag v-else type="info">回收</el-tag>
        </template>
      </el-table-column>

      <el-table-column label="电脑" min-width="260">
        <template #default="{row}">
          <div style="font-weight:600">{{ row.brand }} · {{ row.model }}</div>
          <div style="color:#999;font-size:12px">SN：{{ row.serial_no }}</div>
        </template>
      </el-table-column>

      <el-table-column label="员工" width="220">
        <template #default="{row}">
          <div v-if="row.type!=='IN'">
            <div style="font-weight:600">{{ row.employee_name || "-" }}</div>
            <div style="color:#999;font-size:12px">{{ row.employee_no || "-" }} · {{ row.department || "-" }}</div>
          </div>
          <span v-else>-</span>
        </template>
      </el-table-column>

      <el-table-column prop="config_date" label="配置日期" width="130" />
      <el-table-column prop="recycle_date" label="回收/归还日期" width="130" />
      <el-table-column prop="remark" label="备注" min-width="220" show-overflow-tooltip />
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
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { apiGet } from "../api/client";

const rows = ref<any[]>([]);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(50);
const total = ref(0);

const type = ref<string>("");
const keyword = ref<string>("");
const dateRange = ref<[string, string] | null>(null);

function onSearch() {
  page.value = 1;
  load();
}

function reset() {
  type.value = "";
  keyword.value = "";
  dateRange.value = null;
  page.value = 1;
  load();
}

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (type.value) params.set("type", type.value);
    if (keyword.value) params.set("keyword", keyword.value);
    if (dateRange.value?.[0]) params.set("date_from", `${dateRange.value[0]} 00:00:00`);
    if (dateRange.value?.[1]) params.set("date_to", `${dateRange.value[1]} 23:59:59`);
    params.set("page", String(page.value));
    params.set("page_size", String(pageSize.value));

    const r: any = await apiGet(`/api/pc-tx?${params.toString()}`);
    rows.value = r.data || [];
    total.value = Number(r.total || 0);
  } catch (e: any) {
    ElMessage.error(e?.message || "加载失败");
  } finally {
    loading.value = false;
  }
}

function onPageChange() {
  load();
}
function onPageSizeChange() {
  page.value = 1;
  load();
}

onMounted(load);
</script>
