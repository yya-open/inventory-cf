import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const buildId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

export default defineConfig({
  plugins: [vue(), {
    // 把 Element Plus 的官方 css 整体包进 @layer element-plus。
    // CSS Cascade Layers 规则：未分层样式永远压过已分层样式，与源码顺序/特异性无关。
    // 于是无论 EP 的 css 是同步、异步 chunk 还是延迟注入，我们（未分层）的样式都稳压它，
    // 不再依赖 !important 去压 EP 官方规则。theme-chalk 无 @charset / @import，可安全整体包裹。
    name: 'wrap-element-plus-in-layer',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('element-plus')) return null;
      if (!/\.css(\?|$)/.test(id)) return null;
      if (code.trimStart().startsWith('@layer element-plus')) return null;
      return { code: `@layer element-plus {\n${code}\n}`, map: null };
    },
  }, {
    name: 'inject-build-id-meta',
    transformIndexHtml(html) {
      return html.replace('</head>', `  <meta name="inventory-build-id" content="${buildId}" />\n</head>`);
    },
  }],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    extensions: ['.mjs', '.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // 让路由页面和工具模块尽量按需拆分，避免进入电脑台账时预先拉取系统页/Excel 工具等非首屏资源。
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('xlsx')) return 'xlsx';
          if (id.includes('jszip')) return 'jszip';
          if (id.includes('qrcode')) return 'qrcode';
          if (/[\\/]node_modules[\\/](@vue|vue)[\\/]/.test(id)) return 'vue-vendor';
          if (id.includes('@element-plus/icons-vue')) return 'el-icons';
          if (id.includes('element-plus')) {
            if (id.includes('element-plus/es/components/message-box')) return 'el-message-box';
            if (id.includes('element-plus/es/components/message')) return 'el-message';
            if (id.includes('element-plus/es/components/notification')) return 'el-notification';
            if (id.includes('element-plus/es/components/table')) return 'el-table';
            if (id.includes('element-plus/es/components/select')) return 'el-select';
            if (id.includes('element-plus/es/components/date-picker')) return 'el-date-picker';
            if (id.includes('element-plus/es/components/pagination')) return 'el-pagination';
            if (id.includes('element-plus/es/components/checkbox')) return 'el-checkbox';
            if (id.includes('element-plus/es/components/descriptions')) return 'el-descriptions';
            if (id.includes('element-plus/es/components/input-number')) return 'el-input-number';
            if (id.includes('element-plus/es/components/switch')) return 'el-switch';
            if (id.includes('element-plus/es/components/upload')) return 'el-upload';
            if (id.includes('element-plus/es/components/tabs') || id.includes('element-plus/es/components/tab-pane')) return 'el-tabs';
            if (id.includes('element-plus/es/components/popconfirm')) return 'el-popconfirm';
            if (id.includes('element-plus/es/components/scrollbar')) return 'el-scrollbar';
            if (id.includes('element-plus/es/components/divider')) return 'el-divider';
            if (id.includes('element-plus/es/components/radio')) return 'el-radio';
            if (id.includes('element-plus/es/components/segmented')) return 'el-segmented';
            if (id.includes('element-plus/es/components/skeleton')) return 'el-skeleton';
            if (id.includes('element-plus/es/components/steps') || id.includes('element-plus/es/components/step')) return 'el-steps';
            if (id.includes('element-plus/es/components/progress')) return 'el-progress';
            if (!id.includes('element-plus/es/components/')) return 'el-shared';
            return 'element-plus';
          }
          if (id.includes('vue-router')) return 'vue-router';
          return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
