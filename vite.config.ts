import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const buildId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

export default defineConfig({
  plugins: [vue(), {
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
          if (id.endsWith('/src/utils/excel.ts')) return 'excel-utils';
          if (id.includes('/src/views/System')) return 'system-views';
          if (id.includes('/src/views/Pc') || id.includes('/src/views/Monitor')) return 'pc-monitor-views';
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('xlsx')) return 'xlsx';
          if (id.includes('jszip')) return 'jszip';
          if (id.includes('qrcode')) return 'qrcode';
          if (id.includes('element-plus')) return 'element-plus';
          if (id.includes('vue-router')) return 'vue-router';
          if (id.includes('/vue/')) return 'vendor';
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
