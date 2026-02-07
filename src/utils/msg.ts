import { ElMessage } from "element-plus";

// Always pass a full options object to avoid edge-case runtime errors.
const D_SUCCESS = 2000;
const D_INFO = 2000;
const D_WARN = 3000;
const D_ERROR = 4000;

export function msgSuccess(message: string, duration: number = D_SUCCESS) {
  return ElMessage({ type: "success", message, duration, showClose: true });
}

export function msgInfo(message: string, duration: number = D_INFO) {
  return ElMessage({ type: "info", message, duration, showClose: true });
}

export function msgWarn(message: string, duration: number = D_WARN) {
  return ElMessage({ type: "warning", message, duration, showClose: true });
}

export function msgError(message: string, duration: number = D_ERROR) {
  return ElMessage({ type: "error", message, duration, showClose: true });
}
