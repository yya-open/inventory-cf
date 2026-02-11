import { computed } from "vue";
import { useWarehouse } from "../store/warehouse";

// 配件仓固定为 1；电脑仓固定为 2
export function useFixedWarehouseId() {
  const wh = useWarehouse();
  return computed(() => (wh.active === "pc" ? 2 : 1));
}
