<template>
  <el-card>
    <template #header>
      <div style="display:flex; justify-content:space-between; align-items:center">
        <div style="font-weight:700">审计日志</div>
        <div style="display:flex; gap:8px; align-items:center">
          <el-input v-model="keyword" placeholder="搜索 用户/动作/实体/ID" clearable style="width: 220px" />
          <el-input v-model="action" placeholder="action" clearable style="width: 140px" />
          <el-input v-model="entity" placeholder="entity" clearable style="width: 120px" />
          <el-input v-model="user" placeholder="user" clearable style="width: 120px" />
          <el-date-picker v-model="range" type="daterange" range-separator="-" start-placeholder="开始" end-placeholder="结束" />
          <el-button type="primary" @click="onSearch">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </div>
      </div>
    </template>

    <el-table :data="rows" v-loading="loading" border style="width:100%">
      <el-table-column prop="id" label="#" width="80" />
      <el-table-column prop="created_at" label="时间" min-width="170" />
      <el-table-column prop="username" label="用户" width="130" />
      <el-table-column prop="action" label="动作" min-width="160" />
      <el-table-column prop="entity" label="实体" width="130" />
      <el-table-column prop="entity_id" label="实体ID" min-width="120" />
      <el-table-column prop="ip" label="IP" width="140" />
      <el-table-column label="详情" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openPayload(row)">查看</el-button>
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

    <el-dialog v-model="showPayload" title="payload_json" width="720px">
      <el-input v-model="payloadText" type="textarea" :rows="18" readonly />
      <template #footer>
        <el-button @click="showPayload=false">关闭</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { apiGet } from "../api/client";
import { ElMessage } from "element-plus";

const rows = ref<any[]>([]);
const loading = ref(false);

const keyword = ref("");
const action = ref("");
const entity = ref("");
const user = ref("");
const range = ref<any>(null);

const page = ref(1);
const pageSize = ref(50);
const total = ref(0);

const showPayload = ref(false);
const payloadText = ref("");

function onSearch(){
  page.value = 1;
  load();
}
function onPageChange(){ load(); }
function onPageSizeChange(){ page.value = 1; load(); }

function reset(){
  keyword.value = "";
  action.value = "";
  entity.value = "";
  user.value = "";
  range.value = null;
  page.value = 1;
  load();
}

function openPayload(row:any){
  payloadText.value = row?.payload_json || "";
  showPayload.value = true;
}

async function load(){
  loading.value = true;
  try{
    const params = new URLSearchParams();
    if (keyword.value) params.set("keyword", keyword.value);
    if (action.value) params.set("action", action.value);
    if (entity.value) params.set("entity", entity.value);
    if (user.value) params.set("user", user.value);
    if (range.value?.length === 2){
      // ElementPlus gives Date objects
      const s = new Date(range.value[0]);
      const e = new Date(range.value[1]);
      params.set("date_from", s.toISOString().slice(0,10));
      params.set("date_to", e.toISOString().slice(0,10));
    }
    params.set("page", String(page.value));
    params.set("page_size", String(pageSize.value));

    const j:any = await apiGet(`/api/audit/list?${params.toString()}`);
    rows.value = j.data || [];
    total.value = Number(j.total || 0);
  }catch(e:any){
    ElMessage.error(e.message || "加载失败");
  }finally{
    loading.value = false;
  }
}

onMounted(load);
</script>
