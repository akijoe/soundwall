import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Spotify only allows loopback IPs (not "localhost") for http redirect URIs,
// so the dev server is bound to 127.0.0.1 explicitly.
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the same build works at the domain root or under
  // a sub-path like https://<user>.github.io/<repo>/.
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
})
