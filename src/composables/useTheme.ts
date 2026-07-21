import { computed, ref } from 'vue';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'inventory_theme_mode';
const mode = ref<ThemeMode>('light');
let initialized = false;

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(next: ThemeMode) {
  mode.value = next;
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = next;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // 浏览器隐私模式下仍保持当前页面主题。
  }
}

export function useTheme() {
  if (!initialized) {
    initialized = true;
    applyTheme(readStoredMode());
  }

  const isDark = computed(() => mode.value === 'dark');

  function toggleTheme() {
    applyTheme(isDark.value ? 'light' : 'dark');
  }

  return {
    mode,
    isDark,
    toggleTheme,
  };
}