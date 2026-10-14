import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { CONTENT_SECURITY_POLICY } from './seo/csp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Build-only: the dev server injects an inline React Refresh preamble that a
// CSP without 'unsafe-inline' would block. Placed right after <meta charset>
// so it governs every script and stylesheet tag that follows.
const cspMetaPlugin = (): Plugin => ({
  name: 'coachai-csp-meta',
  apply: 'build',
  transformIndexHtml(html) {
    const meta = `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`
    return html.replace(/(<meta charset="UTF-8"\s*\/?>)/i, `$1\n    ${meta}`)
  },
})

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), cspMetaPlugin()],
  publicDir: 'pub',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  build: {
    outDir: 'dist',
    manifest: true,
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn']
      },
      mangle: {
        toplevel: true,
        safari10: true
      },
      format: {
        comments: false
      }
    },
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[hash].js',
        entryFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]'
      }
    }
  },
  server: {
    host: true
  }
})
