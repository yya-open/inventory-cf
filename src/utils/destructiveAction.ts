import type { LoadingInstance } from "element-plus/es/components/loading/src/loading";
import { ElLoading, ElMessage } from "./el-services";

export async function withDestructiveActionFeedback<T>(label: string, action: () => Promise<T>): Promise<T> {
  ElMessage.info(`${label}已开始，请稍候…`);
  let loading: LoadingInstance | undefined;
  try {
    loading = ElLoading.service({
      lock: true,
      text: `${label}中，请稍候…`,
      background: 'rgba(255, 255, 255, 0.55)',
    }) as LoadingInstance;
    return await action();
  } finally {
    try {
      loading?.close();
    } catch {}
  }
}
