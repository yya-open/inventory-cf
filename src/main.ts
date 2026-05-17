import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { installElementPlus } from './plugins/element-plus';
import './styles/app.css';
import './styles/system-tokens.css';
import './styles/enterprise.css';
import { startBuildVersionWatcher } from './utils/appVersion';
import { scheduleOnIdle } from './utils/idle';

// Vite 5 modulepreload 失败时自动刷新页面（部署版本更新后旧 chunk 不存在）
// 防止无限刷新：同一会话内最多自动刷新一次
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const key = '__inventory_preload_reload__';
  try {
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 10_000) return; // 10秒内不重复刷新
    sessionStorage.setItem(key, String(Date.now()));
  } catch {}
  window.location.reload();
});

startBuildVersionWatcher();
scheduleOnIdle(() => {
  void import('./plugins/element-plus-extra-styles');
}, 1400);

const app = createApp(App);
installElementPlus(app);
app.use(router).mount('#app');
