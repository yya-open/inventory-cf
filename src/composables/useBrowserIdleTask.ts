import { onScopeDispose } from 'vue';

export interface BrowserIdleTaskOptions {
  timeout?: number;
}

/**
 * 浏览器空闲任务调度 composable
 * 用于在浏览器空闲时执行低优先级任务
 */
export function useBrowserIdleTask() {
  let idleRunnerTimer: number | null = null;
  let idleCallbackId: number | null = null;
  let idleRafId: number | null = null;
  let deferredTimer: number | null = null;

  function clearAllTimers() {
    if (typeof window === 'undefined') return;

    if (idleRunnerTimer != null) {
      window.clearTimeout(idleRunnerTimer);
      idleRunnerTimer = null;
    }
    if (idleCallbackId != null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleCallbackId);
      idleCallbackId = null;
    }
    if (idleRafId != null) {
      window.cancelAnimationFrame(idleRafId);
      idleRafId = null;
    }
    if (deferredTimer != null) {
      window.clearTimeout(deferredTimer);
      deferredTimer = null;
    }
  }

  /**
   * 在浏览器空闲时执行任务
   */
  function runWhenBrowserIdle(task: () => void | Promise<void>, timeout = 1200) {
    if (typeof window === 'undefined') {
      void Promise.resolve().then(task);
      return;
    }

    // 清除之前的定时器
    if (idleRunnerTimer != null) {
      window.clearTimeout(idleRunnerTimer);
      idleRunnerTimer = null;
    }
    if (idleCallbackId != null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleCallbackId);
      idleCallbackId = null;
    }
    if (idleRafId != null) {
      window.cancelAnimationFrame(idleRafId);
      idleRafId = null;
    }

    const runner = () => {
      idleCallbackId = null;
      idleRafId = null;
      idleRunnerTimer = window.setTimeout(() => {
        idleRunnerTimer = null;
        void task();
      }, 80);
    };

    if (typeof window.requestIdleCallback === 'function') {
      idleCallbackId = window.requestIdleCallback(() => runner(), { timeout });
      return;
    }

    idleRafId = window.requestAnimationFrame(() => {
      runner();
    });
  }

  /**
   * 延迟执行任务，支持页面可见性检测
   */
  function scheduleDeferredTask(
    task: () => void | Promise<void>,
    delayMs: number,
    idleTimeout?: number
  ) {
    if (typeof window === 'undefined') return;

    const start = () => {
      if (deferredTimer != null) window.clearTimeout(deferredTimer);
      deferredTimer = window.setTimeout(() => {
        deferredTimer = null;
        runWhenBrowserIdle(task, idleTimeout ?? delayMs * 2);
      }, delayMs);
    };

    if (document.visibilityState === 'visible') {
      start();
      return;
    }

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVisible);
      start();
    };
    document.addEventListener('visibilitychange', onVisible, { passive: true, once: true });
  }

  // 组件卸载时清理所有定时器
  onScopeDispose(() => {
    clearAllTimers();
  });

  return {
    runWhenBrowserIdle,
    scheduleDeferredTask,
    clearAllTimers,
  };
}
