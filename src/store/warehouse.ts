import { reactive } from "vue";

export type WarehouseKey = "parts" | "pc" | "";

const state = reactive<{ active: WarehouseKey }>({
  active: (localStorage.getItem("activeWarehouse") as WarehouseKey) || "",
});

export function useWarehouse() {
  return state;
}

export function setWarehouse(k: WarehouseKey) {
  state.active = k;
  if (k) localStorage.setItem("activeWarehouse", k);
  else localStorage.removeItem("activeWarehouse");
}

export function clearWarehouse() {
  setWarehouse("");
}
