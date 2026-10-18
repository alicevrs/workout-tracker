/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * The on-phone text reader (Tesseract) for nutrition label photos: its worker, engine and Italian
 * language data are published with the app under ocr/ instead of being fetched from a CDN.
 * They are loaded only when a photo is read, and are not precached (about 13 MB).
 */
function ocrAssets(): Plugin {
  const files: [string, string][] = [
    ['ocr/worker.min.js', 'node_modules/tesseract.js/dist/worker.min.js'],
    ['ocr/tesseract-core-lstm.wasm.js', 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js'],
    ['ocr/tesseract-core-simd-lstm.wasm.js', 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js'],
    ['ocr/tesseract-core-relaxedsimd-lstm.wasm.js', 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js'],
    ['ocr/lang/ita.traineddata.gz', 'node_modules/@tesseract.js-data/ita/4.0.0_best_int/ita.traineddata.gz'],
  ];
  return {
    name: 'ocr-assets',
    apply: 'build',
    generateBundle() {
      for (const [fileName, from] of files) this.emitFile({ type: 'asset', fileName, source: readFileSync(from) });
    },
  };
}

// GitHub Pages serves the app from /<repo-name>/. Override with BASE_PATH if the repo is renamed.
const base = process.env.BASE_PATH ?? '/workout-tracker/';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev') },
  base,
  plugins: [
    react(),
    ocrAssets(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon-mr.svg', 'apple-touch-icon-mr.png'],
      manifest: {
        name: 'Workout Tracker',
        short_name: 'Workouts',
        description: 'Plan, time, log and analyse your training. Works offline.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192-mr.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512-mr.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512-mr.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json,woff2,m4a}'],
        globIgnores: ['ocr/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
