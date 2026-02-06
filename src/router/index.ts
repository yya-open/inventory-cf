import { createRouter, createWebHistory } from "vue-router";
import StockQuery from "../views/StockQuery.vue";
import StockIn from "../views/StockIn.vue";
import StockOut from "../views/StockOut.vue";
import TxList from "../views/TxList.vue";
import Warnings from "../views/Warnings.vue";
import Items from "../views/Items.vue";

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/stock" },
    { path: "/stock", component: StockQuery },
    { path: "/in", component: StockIn },
    { path: "/out", component: StockOut },
    { path: "/tx", component: TxList },
    { path: "/warnings", component: Warnings },
    { path: "/items", component: Items },
  ],
});
