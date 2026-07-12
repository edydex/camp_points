import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    // Vite's React Fast Refresh preamble is injected as an inline script.
    // The Electron renderer intentionally blocks inline scripts with CSP, so
    // enabling HMR would leave the app on a blank screen in `npm run dev`.
    // Full-page renderer reloads keep local development compatible with the
    // same strict CSP used by packaged builds.
    server: {
      hmr: false,
    },
    build: {
      rollupOptions: {
        input: {
          presenter: resolve(__dirname, 'src/renderer/presenter/index.html'),
          stage: resolve(__dirname, 'src/renderer/stage/index.html'),
        },
      },
    },
  },
})
