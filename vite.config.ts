import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('xlsx')) return 'xlsx';
          if (id.includes('@element-plus/icons-vue')) return 'element-plus-icons';
          if (id.includes('element-plus')) {
            if (id.includes('/components/table') || id.includes('/components/pagination') || id.includes('/components/scrollbar')) return 'el-data';
            if (id.includes('/components/form') || id.includes('/components/input') || id.includes('/components/select') || id.includes('/components/date-picker') || id.includes('/components/upload') || id.includes('/components/input-number') || id.includes('/components/option')) return 'el-form';
            if (id.includes('/components/dialog') || id.includes('/components/message') || id.includes('/components/message-box') || id.includes('/components/alert') || id.includes('/components/popconfirm') || id.includes('/components/popover')) return 'el-feedback';
            if (id.includes('/components/card') || id.includes('/components/button') || id.includes('/components/tag') || id.includes('/components/tabs') || id.includes('/components/dropdown') || id.includes('/components/menu') || id.includes('/components/container') || id.includes('/components/divider') || id.includes('/components/descriptions') || id.includes('/components/skeleton') || id.includes('/components/progress') || id.includes('/components/segmented')) return 'el-ui';
            return 'element-plus-core';
          }
          if (id.includes('vue') || id.includes('vue-router')) return 'vue-vendor';
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
