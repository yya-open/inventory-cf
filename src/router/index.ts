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
import Users from "../views/Users.vue";
import AuditLog from "../views/AuditLog.vue";
import ImportItems from "../views/ImportItems.vue";
import { fetchMe, useAuth, can } from "../store/auth";
import { msgError, msgInfo, msgSuccess, msgWarn } from "../utils/msg";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/stock" },
    { path: "/login", component: Login, meta: { public: true } },

    { path: "/stock", component: StockQuery, meta: { role: "viewer" } },
    { path: "/tx", component: TxList, meta: { role: "viewer" } },
    { path: "/warnings", component: Warnings, meta: { role: "viewer" } },

    { path: "/dashboard", component: Dashboard, meta: { role: "viewer" } },

    { path: "/batch", component: BatchTx, meta: { role: "operator" } },
    { path: "/stocktake", component: Stocktake, meta: { role: "admin" } },

    { path: "/in", component: StockIn, meta: { role: "operator" } },
    { path: "/out", component: StockOut, meta: { role: "operator" } },

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

  const need = (to.meta as any)?.role as any;
  if (need && !can(need)) {
    msgWarn("权限不足");
    return { path: "/stock" };
  }
  return true;
});

export default router;
