import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  define: {
    // Shown in Settings -> Account and sent with the push-device registration, so a stale
    // token in the API can be traced back to the build it came from.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    // Anything touching a component opts in per file with:
    //   // @vitest-environment jsdom
    environmentMatchGlobs: [['src/**/*.dom.test.js', 'jsdom']],
  },
})
