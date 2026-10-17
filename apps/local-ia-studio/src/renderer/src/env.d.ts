/// <reference types="vite/client" />

import type { Api } from '@shared/api'
import type { StudioBridge } from '../../../../../packages/module-api/src/types'

declare global {
  interface Window {
    api: Api
    studio?: StudioBridge
  }
}
