import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

function elementPlusChunk(id: string) {
  if (!id.includes('node_modules/element-plus')) return undefined;
  if (id.includes('/es/components/table') || id.includes('/es/components/pagination')) {
    return 'ep-table';
  }
  if (
    id.includes('/es/components/form') ||
    id.includes('/es/components/input') ||
    id.includes('/es/components/select') ||
    id.includes('/es/components/option') ||
    id.includes('/es/components/date-picker') ||
    id.includes('/es/components/input-number') ||
    id.includes('/es/components/upload') ||
    id.includes('/es/components/radio') ||
    id.includes('/es/components/checkbox') ||
    id.includes('/es/components/switch')
  ) {
    return 'ep-form';
  }
  if (
    id.includes('/es/components/dialog') ||
    id.includes('/es/components/message') ||
    id.includes('/es/components/message-box') ||
    id.includes('/es/components/descriptions') ||
    id.includes('/es/components/alert') ||
    id.includes('/es/components/popconfirm') ||
    id.includes('/es/components/tag') ||
    id.includes('/es/components/card')
  ) {
    return 'ep-feedback';
  }
  if (
    id.includes('/es/components/menu') ||
    id.includes('/es/components/dropdown') ||
    id.includes('/es/components/tabs') ||
    id.includes('/es/components/container') ||
    id.includes('/es/components/row') ||
    id.includes('/es/components/col') ||
    id.includes('/es/components/divider') ||
    id.includes('/es/components/button') ||
    id.includes('/es/components/icon') ||
    id.includes('/es/components/progress') ||
    id.includes('/es/components/skeleton') ||
    id.includes('/es/components/segmented') ||
    id.includes('/es/components/empty') ||
    id.includes('/es/components/scrollbar')
  ) {
    return 'ep-layout';
  }
  return 'ep-core';
}

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('xlsx')) return 'xlsx';
          if (id.includes('@element-plus/icons-vue')) return 'element-plus-icons';
          const epChunk = elementPlusChunk(id);
          if (epChunk) return epChunk;
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
