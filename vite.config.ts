import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const sepayKey = env.VITE_SEPAY_WEBHOOK_API_KEY || env.SEPAY_WEBHOOK_API_KEY || 'HYX7LBJQCNMB8SHIUZSHIS8ZPQDTRAPSYBIF4ZRCV5OE63CFOJLKXLJGQWVGKNY0'
  const appUrl = env.VITE_APP_URL || 'https://ai.baominh.io.vn'

  return {
    plugins: [react()],
    define: {
      'process.env': {
        SEPAY_WEBHOOK_API_KEY: JSON.stringify(sepayKey),
        APP_URL: JSON.stringify(appUrl),
      },
    },
    build: {
      outDir: 'dist',
    },
  }
})
