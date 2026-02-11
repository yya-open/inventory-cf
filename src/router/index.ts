import { createRouter, createWebHistory } from "vue-router";
import StockQuery from "../views/StockQuery.vue";
import StockIn from "../views/StockIn.vue";
import StockOut from "../views/StockOut.vue";
import TxList from "../views/TxList.vue";
import Warnings from "../views/Warnings.vue";
import BatchTx from "../views/BatchTx.vue";
import Stocktake from "../views/Stocktake.vue";
import Dashboard from "../views/Dashboard.vue";
import Items from "../views/Items.vue";
import Login from "../views/Login.vue";
import WarehouseSelect from "../views/WarehouseSelect.vue";
import Users from "../views/Users.vue";
import AuditLog from "../views/AuditLog.vue";
import BackupRestore from "../views/BackupRestore.vue";
import ImportItems from "../views/ImportItems.vue";
import PcOut from "../views/PcOut.vue";
import PcIn from "../views/PcIn.vue";
import PcTx from "../views/PcTx.vue";
import PcRecycle from "../views/PcRecycle.vue";
import PcAssets from "../views/PcAssets.vue";
import PcWarehouse from "../views/PcWarehouse.vue";
import { fetchMe, useAuth, can } from "../store/auth";
import { useWarehouse, setWarehouse } from "../store/warehouse";
import { ElMessage } from "element-plus";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/warehouses" },
    { path: "/login", component: Login, meta: { public: true } },
    { path: "/warehouses", component: WarehouseSelect, meta: { role: "viewer" } },

    { path: "/stock", component: StockQuery, meta: { role: "viewer" } },
    { path: "/tx", component: TxList, meta: { role: "viewer" } },
    { path: "/warnings", component: Warnings, meta: { role: "viewer" } },

    { path: "/dashboard", component: Dashboard, meta: { role: "viewer" } },

    // 仓库2（电脑仓）使用一个入口 /pc，并在页面内 Tab 切换子功能
    {
      path: "/pc",
      component: PcWarehouse,
      redirect: "/pc/assets",
      meta: { role: "viewer", title: "电脑仓（仓库2）" },
      children: [
        { path: "assets", component: PcAssets, meta: { role: "viewer", title: "电脑台账" } },
        { path: "tx", component: PcTx, meta: { role: "viewer", title: "出入库明细" } },
        { path: "in", component: PcIn, meta: { role: "operator", title: "电脑入库" } },
        { path: "out", component: PcOut, meta: { role: "operator", title: "电脑出库" } },
        { path: "recycle", component: PcRecycle, meta: { role: "operator", title: "回收/归还" } },
      ],
    },

    { path: "/batch", component: BatchTx, meta: { role: "operator" } },
    { path: "/stocktake", component: Stocktake, meta: { role: "admin" } },

    { path: "/in", component: StockIn, meta: { role: "operator" } },
    { path: "/out", component: StockOut, meta: { role: "operator" } },

    { path: "/backup", component: BackupRestore, meta: { role: "admin" } },

    { path: "/items", component: Items, meta: { role: "admin" } },
    { path: "/import/items", component: ImportItems, meta: { role: "admin" } },
    { path: "/audit", component: AuditLog, meta: { role: "admin" } },
    { path: "/users", component: Users, meta: { role: "admin" } },
  ],
});

router.beforeEach(async (to) => {
  if ((to.meta as any)?.public) return true;
  const auth = useAuth();
  if (!auth.token) return { path: "/login", query: { redirect: to.fullPath } };

  if (!auth.user) {
    try {
      await fetchMe();
    } catch (e: any) {
      auth.token = "";
      localStorage.removeItem("token");
      return { path: "/login" };
    }
  }


// 仓库选择：登录后必须先选择进入“配件仓/电脑仓”
const wh = useWarehouse();
if (to.path !== "/warehouses") {
  // 若还没选仓库，强制跳转到选择页
  if (!wh.active) {
    return { path: "/warehouses", query: { redirect: to.fullPath } };
  }
  // 根据路由自动对齐仓库（避免刷新/直链导致菜单错位）
  if (to.path.startsWith("/pc") && wh.active !== "pc") setWarehouse("pc");
  if (!to.path.startsWith("/pc") && wh.active !== "parts") setWarehouse("parts");
}
  const need = (to.meta as any)?.role as any;
  if (need && !can(need)) {
    ElMessage.warning("权限不足");
    return { path: "/stock" };
  }
  return true;
});

export default router;
