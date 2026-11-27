import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 3000 },
  define: command === 'build' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : undefined,
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 0,
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules\/(react|react-dom|scheduler)\//,
              priority: 50,
            },
            {
              name: 'router',
              test: /node_modules\/(react-router-dom|react-router|@remix-run\/router)\//,
              priority: 45,
            },
            {
              name: 'firebase-auth',
              test: /node_modules\/(@firebase\/auth|firebase\/auth)/,
              priority: 42,
            },
            {
              name: 'firebase-firestore',
              test: /node_modules\/(@firebase\/firestore|firebase\/firestore|@firebase\/webchannel-wrapper)/,
              priority: 41,
            },
            {
              name: 'firebase-core',
              test: /node_modules\/(firebase|@firebase)\//,
              priority: 40,
            },
            {
              name: 'table-vendor',
              test: /node_modules\/@tanstack\//,
              priority: 38,
            },
            {
              name: 'icons',
              test: /node_modules\/lucide-react\//,
              priority: 36,
            },
            {
              name: 'recharts-core',
              test: /node_modules\/recharts\//,
              priority: 35,
            },
            {
              name: 'charts-d3',
              test: /node_modules\/(d3-|victory-vendor|internmap)/,
              priority: 34,
            },
            {
              name: 'charts-state',
              test: /node_modules\/(@reduxjs\/toolkit|react-redux|redux|reselect|immer|es-toolkit|eventemitter3|decimal\.js-light|use-sync-external-store|tiny-invariant|clsx)\//,
              priority: 33,
            },
            {
              name: 'exceljs',
              test: /node_modules\/exceljs\//,
              priority: 32,
            },
            {
              name: 'exceljs-deps',
              test: /node_modules\/(jszip|archiver|unzipper|readable-stream|fast-csv|saxes|dayjs|tmp|uuid)\//,
              priority: 31,
            },
            {
              name: 'messages-fa',
              test: /\/src\/messages\/fa\.json/,
              priority: 28,
            },
            {
              name: 'catalog-brands',
              test: /\/src\/data\/brandProducts/,
              priority: 26,
            },
            {
              name: 'catalog-archetypes',
              test: /\/src\/data\/(categoryArchetypes|expandedCatalog)/,
              priority: 25,
            },
            {
              name: 'catalog-seed',
              test: /\/src\/data\/(seed|seoCopyHelper)/,
              priority: 24,
            },
          ],
        },
      },
    },
  },
}));
