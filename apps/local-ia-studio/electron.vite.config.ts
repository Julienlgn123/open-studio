import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    // Worker ES module : la dictée (Whisper) tourne dans un worker qui importe transformers.js.
    worker: { format: 'es' },
    // Le moteur ONNX utilise « await » au niveau du module : cible JavaScript récente (Electron la gère).
    build: { target: 'esnext' },
    optimizeDeps: { esbuildOptions: { target: 'esnext' }, exclude: ['@huggingface/transformers', 'onnxruntime-web'] },
    plugins: [react()]
  }
})
