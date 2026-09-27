import type {
  ActivityEntry,
  AppSettings,
  BloatApp,
  CleanResult,
  CleanTarget,
  HardwareProfile,
  LiveStats,
  ProfileApplyResult,
  ProfileDef,
  ProfileId,
  StartupItem,
  TweakInfo,
  TweakResult
} from './types'

export interface Api {
  window: { minimize: () => Promise<void>; maximize: () => Promise<void>; close: () => Promise<void> }
  app: { version: () => Promise<string>; platform: () => Promise<string> }
  hardware: { get: (force?: boolean) => Promise<HardwareProfile>; stats: () => Promise<LiveStats> }
  profiles: {
    list: () => Promise<ProfileDef[]>
    active: () => Promise<ProfileId | null>
    apply: (id: ProfileId) => Promise<ProfileApplyResult>
    restore: () => Promise<{ ok: boolean; error: string | null }>
    onChanged: (cb: (r: ProfileApplyResult) => void) => () => void
  }
  tweaks: {
    list: () => Promise<TweakInfo[]>
    apply: (ids: string[]) => Promise<TweakResult & { backupDir: string | null }>
    revert: (ids: string[]) => Promise<TweakResult>
    restorePoint: () => Promise<{ ok: boolean; error: string | null; adminDenied: boolean }>
    openBackups: () => Promise<void>
  }
  startup: {
    list: () => Promise<StartupItem[]>
    set: (id: string, enable: boolean) => Promise<{ ok: boolean; error: string | null; adminDenied: boolean }>
  }
  bloat: {
    list: () => Promise<BloatApp[]>
    remove: (ids: string[]) => Promise<{ removed: string[]; failed: { id: string; error: string }[] }>
    reinstall: (id: string) => Promise<boolean>
  }
  clean: { list: () => Promise<CleanTarget[]>; run: (ids: string[]) => Promise<CleanResult> }
  settings: { get: () => Promise<AppSettings>; set: (patch: Partial<AppSettings>) => Promise<AppSettings> }
  activity: { list: () => Promise<ActivityEntry[]> }
  processes: { list: () => Promise<string[]> }
}
