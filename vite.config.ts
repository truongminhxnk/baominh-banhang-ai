
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Polyfill to allow process.env usage in client-side code
    'process.env': {
      SEPAY_WEBHOOK_API_KEY: "HYX7LBJQCNMB8SHIUZSHIS8ZPQDTRAPSYBIF4ZRCV5OE63CFOJLKXLJGQWVGKNY0"
    }
  },
  build: {
    outDir: 'dist',
  }
})
