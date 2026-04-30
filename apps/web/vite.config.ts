import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cesium static assets that must be copied to the build output.
// Pattern follows the official CesiumGS/cesium-vite-example.
const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesium';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl },
      ],
    }),
  ],
  define: {
    // Required so Cesium can locate its static assets at runtime.
    // We also set window.CESIUM_BASE_URL in the entry point for belt-and-suspenders.
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
  },
  resolve: {
    alias: {
      '@terrain/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  build: {
    // Cesium's bundle is large — raise the warning threshold.
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        // Split Cesium into its own chunk to keep the main bundle small.
        manualChunks: {
          cesium: ['cesium'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
  css: {
    postcss: './postcss.config.js',
  },
});
