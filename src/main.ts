import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { installElementPlus } from './plugins/element-plus';
import './styles/app.css';
import './styles/system-tokens.css';
import { startBuildVersionWatcher } from './utils/appVersion';
import { scheduleOnIdle } from './utils/idle';

startBuildVersionWatcher();
scheduleOnIdle(() => {
  void import('./plugins/element-plus-extra-styles');
}, 1400);

const app = createApp(App);
installElementPlus(app);
app.use(router).mount('#app');
