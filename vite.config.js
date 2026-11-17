import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Bind to localhost by default. Set VITE_DEV_HOST (e.g. 0.0.0.0) to expose the
// dev server deliberately; the host is then added to the allowedHosts whitelist.
const devHost = process.env.VITE_DEV_HOST || 'localhost'
const allowedHosts = ['localhost', '127.0.0.1']
if (!allowedHosts.includes(devHost)) allowedHosts.push(devHost)

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split the big third-party bundles so a single chunk no longer carries
        // react + chart.js + everything else. Matching on node_modules keeps the
        // vendor chunks independent and avoids circular chunk references.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'react-vendor'
          }
          if (
            id.includes('node_modules/chart.js') ||
            id.includes('node_modules/react-chartjs-2') ||
            id.includes('node_modules/chartjs-adapter-date-fns') ||
            id.includes('node_modules/date-fns')
          ) {
            return 'chart-vendor'
          }
          return 'vendor'
        }
      }
    }
  },
  server: {
    host: devHost,
    port: 5173,
    allowedHosts,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
})
