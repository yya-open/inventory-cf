import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    extensions: ['.mjs', '.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.endsWith('/src/utils/excel.ts')) return 'excel-utils';
          if (id.includes('/src/views/') || id.includes('/src/components/')) {
            if (id.includes('/src/views/System') || id.includes('/src/components/system/')) return 'route-system';
            if (id.includes('/src/views/Pc') || id.includes('/src/views/Monitor') || id.includes('/src/components/pc/') || id.includes('/src/components/monitor/')) return 'route-pc';
          }
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('xlsx')) return 'xlsx';
          if (id.includes('qrcode')) return 'qrcode';
          if (id.includes('@element-plus/icons-vue')) return 'element-plus-icons';
          if (id.includes('element-plus')) return 'element-plus';
          if (
            id.includes('@vueuse/core') ||
            id.includes('@floating-ui/') ||
            id.includes('@sxzz/popperjs-es') ||
            id.includes('@ctrl/tinycolor') ||
            id.includes('async-validator') ||
            id.includes('dayjs') ||
            id.includes('lodash') ||
            id.includes('lodash-es') ||
            id.includes('lodash-unified') ||
            id.includes('memoize-one') ||
            id.includes('normalize-wheel-es') ||
            id.includes('vue-component-type-helpers')
          ) {
            return 'element-plus';
          }
          if (id.includes('vue-router') || id.includes('/vue/')) return 'vue-vendor';
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
