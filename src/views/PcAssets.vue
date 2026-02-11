<template>
  <el-card>
    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:12px">
      <el-select v-model="status" placeholder="状态" clearable style="width:160px" @change="onSearch">
        <el-option label="在库" value="IN_STOCK" />
        <el-option label="已领用" value="ASSIGNED" />
        <el-option label="已回收" value="RECYCLED" />
      </el-select>

      <el-input v-model="keyword" clearable placeholder="关键词：序列号/品牌/型号/备注" style="width: 280px" @keyup.enter="onSearch" />

      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button @click="reset">重置</el-button>

      <el-button v-if="canOperator" type="success" plain @click="$router.push('/pc/in')">电脑入库</el-button>
      <el-button v-if="canOperator" type="warning" plain @click="$router.push('/pc/out')">电脑出库</el-button>
      <el-button v-if="canOperator" type="info" plain @click="$router.push('/pc/recycle')">电脑回收/归还</el-button>
      <el-button type="info" plain @click="$router.push('/pc/tx')">出入库明细</el-button>
    </div>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column label="电脑" min-width="260">
        <template #default="{row}">
          <div style="font-weight:600">{{ row.brand }} · {{ row.model }}</div>
          <div style="color:#999;font-size:12px">SN：{{ row.serial_no }}</div>
        </template>
      </el-table-column>

      <el-table-column label="配置" width="170">
        <template #default="{row}">
          <div>{{ row.disk_capacity || "-" }} / {{ row.memory_size || "-" }}</div>
          <div style="color:#999;font-size:12px">保修：{{ row.warranty_end || "-" }}</div>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="120">
        <template #default="{row}">
          <el-tag v-if="row.status==='IN_STOCK'" type="success">在库</el-tag>
          <el-tag v-else-if="row.status==='ASSIGNED'" type="warning">已领用</el-tag>
          <el-tag v-else type="info">已回收</el-tag>
        </template>
      </el-table-column>

      <el-table-column label="当前领用人" width="220">
        <template #default="{row}">
          <div v-if="row.status==='ASSIGNED'">
            <div style="font-weight:600">{{ row.last_employee_name || "-" }}</div>
            <div style="color:#999;font-size:12px">{{ row.last_employee_no || "-" }} · {{ row.last_department || "-" }}</div>
          </div>
          <span v-else>-</span>
        </template>
      </el-table-column>

      <el-table-column prop="last_config_date" label="配置日期" width="130" />
      <el-table-column prop="last_recycle_date" label="回收日期" width="130" />

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
import { ref, onMounted, computed } from "vue";
import { ElMessage } from "element-plus";
import { apiGet } from "../api/client";
import { can } from "../store/auth";

const rows = ref<any[]>([]);
const loading = ref(false);

const page = ref(1);
const pageSize = ref(50);
const total = ref(0);

const status = ref<string>("");
const keyword = ref<string>("");

const canOperator = computed(() => can("operator"));

function onSearch() {
  page.value = 1;
  load();
}

function reset() {
  status.value = "";
  keyword.value = "";
  page.value = 1;
  load();
}

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (status.value) params.set("status", status.value);
    if (keyword.value) params.set("keyword", keyword.value);
    params.set("page", String(page.value));
    params.set("page_size", String(pageSize.value));

    const r: any = await apiGet(`/api/pc-assets?${params.toString()}`);
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
