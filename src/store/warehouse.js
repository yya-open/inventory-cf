import { reactive } from "vue";
const state = reactive({
    active: localStorage.getItem("activeWarehouse") || "",
});
export function useWarehouse() {
    return state;
}
export function setWarehouse(k) {
    state.active = k;
    if (k)
        localStorage.setItem("activeWarehouse", k);
    else
        localStorage.removeItem("activeWarehouse");
}
export function clearWarehouse() {
    setWarehouse("");
}
