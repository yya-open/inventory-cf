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
  // 同步浏览器地址栏/窗口着色，与 tokens.css 的 --bg 保持一致
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = next === 'dark' ? '#11151c' : '#f4f5f7';
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