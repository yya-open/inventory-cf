<template>
  <el-card>
    <el-form
      ref="formRef"
      class="pc-recycle-form"
      :model="form"
      :rules="rules"
      label-width="110px"
      style="max-width: 760px"
    >
      <el-alert
        title="电脑回收/归还（仓库2：电脑仓）"
        type="info"
        show-icon
        :closable="false"
        style="margin-bottom: 12px"
      />

      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:12px">
        <el-button
          size="small"
          @click="downloadRecycleTemplate"
        >
          下载导入模板
        </el-button>

        <el-upload
          :show-file-list="false"
          :auto-upload="false"
          accept=".xlsx,.xls"
          :on-change="onImportRecycleFile"
        >
          <el-button
            size="small"
            type="primary"
          >
            Excel导入（批量回收/归还）
          </el-button>
        </el-upload>
      </div>


      <!--
        修复 Chrome DevTools Issues: Incorrect use of <label for=FORM_ELEMENT>
        Element Plus 的 el-form-item 会生成带 for 的 label；需要确保能匹配到表单控件的 id。
      -->

      <el-form-item
        label="选择电脑"
        prop="asset_id"
        label-for="pc-recycle-asset"
      >
        <el-select
          id="pc-recycle-asset"
          v-model="form.asset_id"
          filterable
          remote
          :remote-method="remoteSearch"
          :loading="assetLoading"
          placeholder="输入序列号/品牌/型号搜索（仅显示已领用）"
          name="asset_id"
          style="width: 100%"
          clearable
          @change="onPickAsset"
        >
          <el-option
            v-for="a in assetOptions"
            :key="a.id"
            :label="`${a.serial_no} · ${a.brand} ${a.model}（${a.last_employee_name || '-'}）`"
            :value="a.id"
          />
        </el-select>
        <div style="margin-top:6px; color:#999; font-size:12px">
          只会列出“已领用”的电脑；若电脑仍在库，请先到「电脑出库」完成领用。
        </div>
      </el-form-item>

      <el-divider content-position="left">
        动作
      </el-divider>

      <el-form-item
        label="回收/归还"
        prop="action"
      >
        <el-radio-group v-model="form.action">
          <el-radio-button label="RETURN">
            归还（回到在库）
          </el-radio-button>
          <el-radio-button label="RECYCLE">
            回收（状态=已回收）
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-divider content-position="left">
        电脑与领用信息
      </el-divider>

      <el-descriptions
        v-if="pickedAsset"
        :column="2"
        border
        style="margin-bottom:12px"
      >
        <el-descriptions-item label="品牌">
          {{ pickedAsset.brand }}
        </el-descriptions-item>
        <el-descriptions-item label="型号">
          {{ pickedAsset.model }}
        </el-descriptions-item>
        <el-descriptions-item label="序列号">
          {{ pickedAsset.serial_no }}
        </el-descriptions-item>
        <el-descriptions-item label="当前状态">
          <el-tag
            v-if="pickedAsset.status==='ASSIGNED'"
            type="warning"
          >
            已领用
          </el-tag>
          <el-tag
            v-else-if="pickedAsset.status==='IN_STOCK'"
            type="success"
          >
            在库
          </el-tag>
          <el-tag
            v-else
            type="info"
          >
            已回收
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="领用人">
          {{ pickedAsset.last_employee_name || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="工号/部门">
          {{ pickedAsset.last_employee_no || '-' }} · {{ pickedAsset.last_department || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="配置日期">
          {{ pickedAsset.last_config_date || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="预计回收">
          {{ pickedAsset.last_recycle_date || '-' }}
        </el-descriptions-item>
      </el-descriptions>

      <el-form-item
        label="回收/归还日期"
        prop="recycle_date"
        label-for="pc-recycle-date"
      >
        <el-date-picker
          id="pc-recycle-date"
          v-model="form.recycle_date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择日期"
          name="recycle_date"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item
        label="备注"
        label-for="pc-recycle-remark"
      >
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
          input-id="pc-recycle-remark"
          name="remark"
        />
      </el-form-item>

      <el-form-item>
        <el-button
          type="primary"
          :disabled="!canSubmit"
          :loading="submitting"
          @click="submit"
        >
          提交
        </el-button>
        <el-button @click="$router.push('/pc/assets')">
          返回台账
        </el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ElDescriptions, ElDescriptionsItem, ElUpload } from 'element-plus';
import { ElDivider, ElRadioButton, ElRadioGroup } from 'element-plus';
import { ref, computed, onMounted } from "vue";
import { ElMessage } from "../utils/el-services";
import { parseXlsx, downloadTemplate } from "../utils/excel";
import type { FormInstance, FormRules } from "element-plus";
import { apiGet, apiPost } from "../api/client";

const formRef = ref<FormInstance>();

const form = ref({
  asset_id: undefined as number | undefined,
  action: "RETURN" as "RETURN" | "RECYCLE",
  recycle_date: "" as string | "",
  remark: "",
});

const rules: FormRules = {
  asset_id: [{ required: true, message: "请选择电脑", trigger: "change" }],
  action: [{ required: true, message: "请选择动作", trigger: "change" }],
  recycle_date: [{ required: true, message: "请选择回收/归还日期", trigger: "change" }],
};

const assetOptions = ref<any[]>([]);
const pickedAsset = ref<any | null>(null);
const assetLoading = ref(false);

async function loadAssets(keyword = "") {
  assetLoading.value = true;
  try {
    const params = new URLSearchParams();
    params.set("status", "ASSIGNED");
    params.set("page", "1");
    params.set("page_size", "50");
    params.set("fast", "1");
    if (keyword) params.set("keyword", keyword);
    const r: any = await apiGet(`/api/pc-assets?${params.toString()}`);
    assetOptions.value = r.data || [];
  } catch (e: any) {
    // ignore
  } finally {
    assetLoading.value = false;
  }
}

let tmr: any = null;
function remoteSearch(q: string) {
  if (tmr) clearTimeout(tmr);
  tmr = setTimeout(() => loadAssets(String(q || "").trim()), 250);
}

function onPickAsset(id: number) {
  const a = assetOptions.value.find((x: any) => Number(x.id) === Number(id));
  pickedAsset.value = a || null;
}

const submitting = ref(false);
const canSubmit = computed(() => {
  return !!form.value.asset_id && !!String(form.value.action || "").trim() && !!String(form.value.recycle_date || "").trim() && !submitting.value;
});

function downloadRecycleTemplate() {
  downloadTemplate({
    filename: "电脑回收归还导入模板.xlsx",
    headers: [
      { title: "序列号" },
      { title: "动作" },
      { title: "回收/归还日期" },
      { title: "备注" },
    ],
    exampleRows: [
      {
        "序列号": "PF5S995W",
        "动作": "RETURN",
        "回收/归还日期": "2026-03-06",
        "备注": "示例，可删除该行",
      },
    ],
  });
}

async function onImportRecycleFile(uploadFile: any) {
  const file: File = uploadFile?.raw;
  if (!file) return;
  try {
    const rows = await parseXlsx(file);
    const items = rows
      .map((r) => ({
        serial_no: String(r["序列号"] ?? r["serial_no"] ?? "").trim(),
        action: String(r["动作"] ?? r["action"] ?? "RETURN").trim() || "RETURN",
        recycle_date: String(r["回收日期"] ?? r["回收/归还日期"] ?? r["recycle_date"] ?? "").trim(),
        remark: String(r["备注"] ?? r["remark"] ?? "").trim(),
      }))
      .filter((x) => x.serial_no && x.recycle_date);

    if (!items.length) {
      ElMessage.warning("Excel里没有可导入的数据");
      return;
    }

    const res: any = await apiPost("/api/pc-recycle-batch", { items });
    const okSum = Number(res?.success || 0);
    const failSum = Number(res?.failed || 0);
    if (failSum > 0) {
      console.warn("pc-recycle-batch errors", res?.errors);
      ElMessage.warning(`导入完成：成功 ${okSum} 条，失败 ${failSum} 条（详情见控制台/接口返回 errors）`);
    } else {
      ElMessage.success(`导入完成：成功 ${okSum} 条`);
    }

    await loadAssets();
  } catch (e: any) {
    ElMessage.error(e?.message || "导入失败");
  }
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;

  submitting.value = true;
  try {
    await apiPost("/api/pc-recycle", { ...form.value });
    ElMessage.success("操作成功");

    form.value.asset_id = undefined;
    pickedAsset.value = null;
    form.value.action = "RETURN";
    form.value.recycle_date = "";
    form.value.remark = "";
    formRef.value?.clearValidate();

    await loadAssets();
  } catch (e: any) {
    ElMessage.error(e?.message || "操作失败");
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  await loadAssets();
});
</script>

<style scoped>
.pc-recycle-form :deep(.el-form-item__label) {
  white-space: nowrap;
}
</style>
