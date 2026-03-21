import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const elementPlusExtraMarkers = [
  '/collapse',
  '/collapse-item',
  '/descriptions',
  '/descriptions-item',
  '/divider',
  '/dropdown',
  '/dropdown-item',
  '/dropdown-menu',
  '/icon',
  '/popconfirm',
  '/popover',
  '/progress',
  '/radio',
  '/radio-button',
  '/radio-group',
  '/scrollbar',
  '/segmented',
  '/skeleton',
  '/step',
  '/steps',
  '/tab-pane',
  '/tabs',
  '/upload',
];

const elementPlusRelatedPackages = [
  '@vueuse/core',
  '@floating-ui/',
  '@sxzz/popperjs-es',
  '@ctrl/tinycolor',
  'async-validator',
  'dayjs',
  'lodash',
  'lodash-es',
  'lodash-unified',
  'memoize-one',
  'normalize-wheel-es',
  'vue-component-type-helpers',
];

export default defineConfig({
  plugins: [vue()],
  resolve: {
    extensions: ['.mjs', '.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('xlsx')) return 'xlsx';
          if (id.includes('@element-plus/icons-vue')) return 'element-plus-icons';
          if (id.includes('element-plus')) {
            return elementPlusExtraMarkers.some((marker) => id.includes(marker))
              ? 'element-plus-extra'
              : 'element-plus-core';
          }
          if (elementPlusRelatedPackages.some((pkg) => id.includes(pkg))) return 'element-plus-core';
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
