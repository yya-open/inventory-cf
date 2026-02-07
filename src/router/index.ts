import { createRouter, createWebHistory } from "vue-router";
// Route-level code splitting: lazy-load views to reduce initial bundle size.
const Login = () => import("../views/Login.vue");
const StockQuery = () => import("../views/StockQuery.vue");
const TxList = () => import("../views/TxList.vue");
const Warnings = () => import("../views/Warnings.vue");
const Dashboard = () => import("../views/Dashboard.vue");
const StockIn = () => import("../views/StockIn.vue");
const StockOut = () => import("../views/StockOut.vue");
const BatchTx = () => import("../views/BatchTx.vue");
const Stocktake = () => import("../views/Stocktake.vue");
const Items = () => import("../views/Items.vue");
const ImportItems = () => import("../views/ImportItems.vue");
const AuditLog = () => import("../views/AuditLog.vue");
const Users = () => import("../views/Users.vue");
const BackupRestore = () => import("../views/BackupRestore.vue");
import { fetchMe, useAuth, can } from "../store/auth";
import { ElMessage } from "element-plus";

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
    { path: "/backup", component: BackupRestore, meta: { role: "admin" } },
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
    ElMessage.warning("权限不足");
    return { path: "/stock" };
  }
  return true;
});

export default router;
