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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.endsWith('/src/utils/excel.ts')) return 'excel-utils';
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('xlsx')) return 'xlsx';
          if (id.includes('qrcode')) return 'qrcode';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
