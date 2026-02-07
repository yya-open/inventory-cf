import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    // Keep chunks smaller for faster first paint on Pages.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("element-plus")) return "vendor_element";
          if (id.includes("xlsx")) return "vendor_xlsx";
          if (id.includes("vue-router")) return "vendor_vue_router";
          if (id.includes("vue")) return "vendor_vue";
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
})
