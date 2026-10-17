import type { ModuleHost } from './types'

// `import { host } from '@open-studio/module'` dans le code main d'un module.
// Open Studio pose le contexte sur globalThis juste avant de charger le module : le bundle
// est évalué d'un bloc à ce moment-là, chaque module garde donc le sien.
const ctx = (globalThis as { __openStudioModule?: ModuleHost }).__openStudioModule
if (!ctx) throw new Error('Ce module doit être chargé par Open Studio.')

export const host: ModuleHost = ctx
