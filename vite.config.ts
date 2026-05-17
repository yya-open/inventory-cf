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
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('xlsx')) return 'xlsx';
          if (id.includes('jszip')) return 'jszip';
          if (id.includes('qrcode')) return 'qrcode';
          if (id.includes('zod')) return 'zod';
          if (/[\\/]node_modules[\\/](@vue|vue)[\\/]/.test(id)) return 'vue-vendor';
          if (id.includes('@element-plus/icons-vue')) return 'el-icons';
          if (id.includes('element-plus')) {
            if (id.includes('element-plus/es/components/table')) return 'el-table';
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
