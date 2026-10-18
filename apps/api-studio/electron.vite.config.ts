import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import { moduleMainConfig, modulePreloadConfig, moduleRendererConfig } from '../../packages/module-api/vite'

// Module d'Open Studio : main et preload chargés par Open Studio, interface avec le kit commun (@ui).
export default defineConfig({
  main: moduleMainConfig(),
  preload: modulePreloadConfig(),
  renderer: moduleRendererConfig({ '@renderer': resolve('src/renderer/src') })
})
