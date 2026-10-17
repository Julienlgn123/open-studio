import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { moduleMainConfig, modulePreloadConfig } from '../../packages/module-api/vite'

// Module d'Open Studio : le main et le preload sont chargés par Open Studio (voir packages/module-api).
export default defineConfig({
  main: moduleMainConfig({ '@shared': resolve('src/shared') }),
  preload: modulePreloadConfig({ '@shared': resolve('src/shared') }),
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
