import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Stamp public/sw.js with a unique build id so every deploy gets a new
 * service-worker cache (old caches are deleted on activate) and the browser
 * detects the update.
 */
function swVersion() {
  let outDir = 'dist'
  return {
    name: 'sw-version',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const file = join(outDir, 'sw.js')
      if (!existsSync(file)) return
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      const src = readFileSync(file, 'utf8')
      writeFileSync(file, src.replaceAll('__SW_VERSION__', id))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), swVersion()],
  preview: {
    allowedHosts: ['willfully-stargazer-brute.ngrok-free.dev']
  }
})
