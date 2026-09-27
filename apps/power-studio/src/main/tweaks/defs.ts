import type { HardwareProfile, TweakCategory, TweakRisk } from '@shared/types'

/** Valeur de registre (Windows). `def` : valeur d'usine si on annule sans sauvegarde (null = supprimer). */
export interface RegOp {
  t: 'reg'
  path: string
  name: string
  kind: 'DWord' | 'String'
  value: number | string
  def: number | string | null
  /** Déjà optimisé si la valeur actuelle est inférieure ou égale (délais en ms). */
  atMost?: boolean
}

/** Type de démarrage d'un service Windows. */
export interface SvcOp {
  t: 'svc'
  name: string
  start: 'Disabled' | 'Manual'
  def: 'Automatic' | 'Manual' | 'Disabled'
}

/** Commande Windows avec sa commande inverse ; l'état est lu dans le registre. */
export interface CmdOp {
  t: 'cmd'
  apply: string
  revert: string
  check: { path: string; name: string; value: number }
}

/** Préférence macOS (`defaults`). */
export interface DefaultsOp {
  t: 'defaults'
  domain: string
  key: string
  type: 'bool' | 'string' | 'int'
  value: string
  def: string | null
  /** Processus à relancer pour que ça prenne effet (Dock, Finder…). */
  restart?: string
}

/** Réglage GNOME (`gsettings`). */
export interface GsettingsOp {
  t: 'gsettings'
  schema: string
  key: string
  value: string
  def: string
}

export type TweakOp = RegOp | SvcOp | CmdOp | DefaultsOp | GsettingsOp

export interface TweakDef {
  id: string
  os: 'windows' | 'mac' | 'linux'
  category: TweakCategory
  title: string
  description: string
  tradeoff: string | null
  risk: TweakRisk
  admin: boolean
  restart: boolean
  ops: TweakOp[]
  recommend: (hw: HardwareProfile) => boolean
}

const reg = (path: string, name: string, value: number | string, def: number | string | null): RegOp => ({
  t: 'reg',
  path,
  name,
  kind: typeof value === 'number' ? 'DWord' : 'String',
  value,
  def
})
const svc = (name: string, def: SvcOp['def'], start: SvcOp['start'] = 'Disabled'): SvcOp => ({ t: 'svc', name, start, def })

const CDM = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager'
const ADV = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced'
const always = (): boolean => true
const never = (): boolean => false
const dedicatedGpu = (hw: HardwareProfile): boolean => hw.gpus.some((g) => !g.integrated && (g.vendor === 'nvidia' || g.vendor === 'amd'))

export const TWEAKS: TweakDef[] = [
  // ─── Confidentialité ─────────────────────────────────────────────
  {
    id: 'win-telemetry',
    os: 'windows',
    category: 'privacy',
    title: 'Télémétrie Windows au minimum',
    description: "Coupe l'envoi de données de diagnostic à Microsoft (service DiagTrack) et le service de routage des messages push WAP.",
    tradeoff: 'Microsoft reçoit moins de rapports : aucun impact sur ton usage.',
    risk: 'safe',
    admin: true,
    restart: false,
    ops: [
      reg('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry', 0, null),
      svc('DiagTrack', 'Automatic'),
      svc('dmwappushservice', 'Manual')
    ],
    recommend: always
  },
  {
    id: 'win-location',
    os: 'windows',
    category: 'privacy',
    title: 'Géolocalisation désactivée',
    description: "Plus aucune app ni Windows ne peut connaître ta position (service de géolocalisation arrêté).",
    tradeoff: 'La météo locale, « Localiser mon appareil », les cartes et le fuseau horaire automatique ne fonctionneront plus.',
    risk: 'safe',
    admin: true,
    restart: false,
    ops: [
      reg('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location', 'Value', 'Deny', 'Allow'),
      reg('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location', 'Value', 'Deny', 'Allow'),
      svc('lfsvc', 'Manual')
    ],
    recommend: (hw) => !hw.laptop
  },
  {
    id: 'win-adid',
    os: 'windows',
    category: 'privacy',
    title: 'Identifiant publicitaire désactivé',
    description: 'Les apps ne peuvent plus te suivre avec un identifiant unique pour te montrer des pubs ciblées.',
    tradeoff: null,
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [reg('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', 'Enabled', 0, 1)],
    recommend: always
  },
  {
    id: 'win-tailored',
    os: 'windows',
    category: 'privacy',
    title: 'Expériences personnalisées désactivées',
    description: 'Microsoft n’utilise plus tes données de diagnostic pour te proposer des astuces et des pubs.',
    tradeoff: null,
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [reg('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy', 'TailoredExperiencesWithDiagnosticDataEnabled', 0, 1)],
    recommend: always
  },
  {
    id: 'win-suggestions',
    os: 'windows',
    category: 'privacy',
    title: 'Pubs et suggestions de Windows',
    description: 'Plus d’apps installées en douce, de suggestions dans le menu Démarrer, l’écran de verrouillage et l’Explorateur.',
    tradeoff: null,
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [
      reg(CDM, 'SilentInstalledAppsEnabled', 0, 1),
      reg(CDM, 'SystemPaneSuggestionsEnabled', 0, 1),
      reg(CDM, 'SoftLandingEnabled', 0, 1),
      reg(CDM, 'SubscribedContent-338388Enabled', 0, 1),
      reg(CDM, 'SubscribedContent-338389Enabled', 0, 1),
      reg(CDM, 'SubscribedContent-353694Enabled', 0, 1),
      reg(CDM, 'SubscribedContent-353696Enabled', 0, 1),
      reg(CDM, 'SubscribedContent-310093Enabled', 0, 1),
      reg(ADV, 'Start_IrisRecommendations', 0, 1),
      reg(ADV, 'ShowSyncProviderNotifications', 0, 1)
    ],
    recommend: always
  },
  {
    id: 'win-activity',
    os: 'windows',
    category: 'privacy',
    title: "Historique d'activité",
    description: 'Windows ne garde plus (et n’envoie plus) la liste des apps et fichiers que tu as ouverts.',
    tradeoff: null,
    risk: 'safe',
    admin: true,
    restart: false,
    ops: [
      reg('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'EnableActivityFeed', 0, null),
      reg('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'PublishUserActivities', 0, null),
      reg('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'UploadUserActivities', 0, null)
    ],
    recommend: always
  },
  {
    id: 'win-bing',
    os: 'windows',
    category: 'privacy',
    title: 'Recherche Bing dans le menu Démarrer',
    description: 'La recherche du menu Démarrer cherche seulement sur ton PC, sans envoyer ce que tu tapes à Bing.',
    tradeoff: 'Plus de résultats web dans le menu Démarrer.',
    risk: 'safe',
    admin: true,
    restart: true,
    ops: [
      reg('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', 'BingSearchEnabled', 0, null),
      reg('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', 'CortanaConsent', 0, null),
      reg('HKCU\\Software\\Policies\\Microsoft\\Windows\\Explorer', 'DisableSearchBoxSuggestions', 1, null)
    ],
    recommend: always
  },
  {
    id: 'win-feedback',
    os: 'windows',
    category: 'privacy',
    title: 'Demandes d’avis de Microsoft',
    description: 'Windows arrête de te demander ton avis (« Comment évaluez-vous… »).',
    tradeoff: null,
    risk: 'safe',
    admin: true,
    restart: false,
    ops: [
      reg('HKCU\\Software\\Microsoft\\Siuf\\Rules', 'NumberOfSIUFInPeriod', 0, null),
      reg('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'DoNotShowFeedbackNotifications', 1, null)
    ],
    recommend: always
  },
  {
    id: 'win-copilot',
    os: 'windows',
    category: 'privacy',
    title: 'Copilot et Recall désactivés',
    description: 'Retire Copilot de la barre des tâches et empêche Recall de faire des captures de ton écran.',
    tradeoff: "Si tu utilises Copilot de Windows, il ne sera plus accessible par la barre des tâches.",
    risk: 'safe',
    admin: true,
    restart: true,
    ops: [
      reg(ADV, 'ShowCopilotButton', 0, 1),
      reg('HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot', 1, null),
      reg('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableAIDataAnalysis', 1, null)
    ],
    recommend: always
  },
  {
    id: 'win-errorreport',
    os: 'windows',
    category: 'privacy',
    title: "Rapports d'erreurs Windows",
    description: 'Les plantages ne sont plus envoyés à Microsoft.',
    tradeoff: null,
    risk: 'safe',
    admin: true,
    restart: false,
    ops: [reg('HKLM\\SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting', 'Disabled', 1, null)],
    recommend: always
  },

  // ─── Performance ─────────────────────────────────────────────────
  {
    id: 'win-gamemode',
    os: 'windows',
    category: 'performance',
    title: 'Mode Jeu activé',
    description: 'Windows donne la priorité au jeu en cours et suspend les mises à jour pendant que tu joues.',
    tradeoff: null,
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [reg('HKCU\\Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', 1, null), reg('HKCU\\Software\\Microsoft\\GameBar', 'AllowAutoGameMode', 1, null)],
    recommend: dedicatedGpu
  },
  {
    id: 'win-gamedvr',
    os: 'windows',
    category: 'performance',
    title: 'Enregistrement Xbox en arrière-plan',
    description: 'Coupe la capture vidéo permanente de la Game Bar, qui consomme GPU et disque pendant les jeux.',
    tradeoff: 'Les clips Xbox (Win+Alt+R) ne fonctionneront plus. ShadowPlay / NVIDIA App n’est pas concerné.',
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [reg('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled', 0, 1), reg('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 0, null)],
    recommend: dedicatedGpu
  },
  {
    id: 'win-hags',
    os: 'windows',
    category: 'performance',
    title: 'Planification GPU accélérée par le matériel',
    description: 'La carte graphique gère elle-même sa mémoire : un peu moins de latence en jeu.',
    tradeoff: 'Rares soucis avec de vieux pilotes : si un jeu plante, annule ce réglage.',
    risk: 'moderate',
    admin: true,
    restart: true,
    ops: [reg('HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode', 2, null)],
    recommend: dedicatedGpu
  },
  {
    id: 'win-mouse',
    os: 'windows',
    category: 'performance',
    title: 'Accélération de la souris désactivée',
    description: '« Améliorer la précision du pointeur » coupé : un mouvement de souris = toujours la même distance (visée plus précise en jeu).',
    tradeoff: 'La souris peut sembler plus lente au début : ajuste sa vitesse si besoin.',
    risk: 'safe',
    admin: false,
    restart: true,
    ops: [reg('HKCU\\Control Panel\\Mouse', 'MouseSpeed', '0', '1'), reg('HKCU\\Control Panel\\Mouse', 'MouseThreshold1', '0', '6'), reg('HKCU\\Control Panel\\Mouse', 'MouseThreshold2', '0', '10')],
    recommend: dedicatedGpu
  },
  {
    id: 'win-startup-delay',
    os: 'windows',
    category: 'performance',
    title: 'Démarrage des apps sans délai',
    description: 'Windows attend normalement quelques secondes avant de lancer les apps de démarrage : ce délai est supprimé.',
    tradeoff: null,
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [reg('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize', 'StartupDelayInMSec', 0, null)],
    recommend: (hw) => hw.disks.some((d) => d.type === 'nvme' || d.type === 'ssd')
  },
  {
    id: 'win-hibernate',
    os: 'windows',
    category: 'performance',
    title: 'Hibernation désactivée',
    description: 'Supprime le fichier hiberfil.sys (aussi gros qu’une grande partie de ta RAM) et libère autant d’espace sur le disque système.',
    tradeoff: 'Plus de mise en veille prolongée ni de « démarrage rapide ». Déconseillé sur un portable.',
    risk: 'moderate',
    admin: true,
    restart: false,
    ops: [{ t: 'cmd', apply: 'powercfg.exe /hibernate off', revert: 'powercfg.exe /hibernate on', check: { path: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power', name: 'HibernateEnabled', value: 0 } }],
    recommend: (hw) => !hw.laptop
  },
  {
    id: 'win-delivery',
    os: 'windows',
    category: 'performance',
    title: 'Partage des mises à jour en P2P',
    description: 'Ton PC n’envoie plus de morceaux de mises à jour Windows à d’autres PC sur internet (économise ta connexion).',
    tradeoff: null,
    risk: 'safe',
    admin: true,
    restart: false,
    ops: [reg('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization', 'DODownloadMode', 0, null)],
    recommend: always
  },
  {
    id: 'win-search-index',
    os: 'windows',
    category: 'performance',
    title: 'Indexation de la recherche Windows',
    description: 'Arrête le service qui scanne en permanence tes fichiers pour la recherche.',
    tradeoff: 'La recherche de fichiers dans le menu Démarrer et l’Explorateur devient lente ; la recherche d’Outlook peut ne plus marcher.',
    risk: 'moderate',
    admin: true,
    restart: false,
    ops: [svc('WSearch', 'Automatic')],
    recommend: never
  },

  // ─── Batterie ────────────────────────────────────────────────────
  {
    id: 'win-background-apps',
    os: 'windows',
    category: 'battery',
    title: 'Apps en arrière-plan bloquées',
    description: 'Les apps du Microsoft Store ne tournent plus en arrière-plan quand elles sont fermées.',
    tradeoff: 'Certaines notifications (Courrier, Calendrier…) peuvent arriver seulement à l’ouverture de l’app.',
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [reg('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', 'GlobalUserDisabled', 1, null)],
    recommend: (hw) => hw.laptop
  },
  {
    id: 'win-transparency',
    os: 'windows',
    category: 'battery',
    title: 'Effets de transparence désactivés',
    description: 'Menus et barre des tâches opaques : moins de travail pour la carte graphique.',
    tradeoff: 'Interface un peu moins jolie.',
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [reg('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', 'EnableTransparency', 0, 1)],
    recommend: (hw) => hw.laptop
  },

  // ─── Interface ───────────────────────────────────────────────────
  {
    id: 'win-animations',
    os: 'windows',
    category: 'interface',
    title: 'Animations des fenêtres réduites',
    description: 'Les fenêtres s’ouvrent et se réduisent instantanément.',
    tradeoff: 'Prend effet à la prochaine ouverture de session.',
    risk: 'safe',
    admin: false,
    restart: true,
    ops: [reg('HKCU\\Control Panel\\Desktop\\WindowMetrics', 'MinAnimate', '0', '1'), reg(ADV, 'TaskbarAnimations', 0, 1)],
    recommend: never
  },
  {
    id: 'win-menu-delay',
    os: 'windows',
    category: 'interface',
    title: 'Menus plus rapides',
    description: 'Les sous-menus s’ouvrent en 0,1 s au lieu de 0,4 s.',
    tradeoff: null,
    risk: 'safe',
    admin: false,
    restart: true,
    ops: [{ ...reg('HKCU\\Control Panel\\Desktop', 'MenuShowDelay', '100', '400'), atMost: true }],
    recommend: always
  },
  {
    id: 'win-widgets',
    os: 'windows',
    category: 'interface',
    title: 'Widgets / Actualités désactivés',
    description: 'Retire le panneau Widgets (météo, actualités MSN) qui tourne en arrière-plan.',
    tradeoff: null,
    risk: 'safe',
    admin: true,
    restart: true,
    ops: [reg('HKLM\\SOFTWARE\\Policies\\Microsoft\\Dsh', 'AllowNewsAndInterests', 0, null)],
    recommend: always
  },

  // ─── Services inutiles ───────────────────────────────────────────
  {
    id: 'win-svc-fax',
    os: 'windows',
    category: 'services',
    title: 'Service Fax',
    description: 'Envoi de fax par modem : inutile sur un PC moderne.',
    tradeoff: null,
    risk: 'safe',
    admin: true,
    restart: false,
    ops: [svc('Fax', 'Manual')],
    recommend: always
  },
  {
    id: 'win-svc-retail',
    os: 'windows',
    category: 'services',
    title: 'Mode démonstration magasin',
    description: 'Service des PC d’exposition en magasin.',
    tradeoff: null,
    risk: 'safe',
    admin: true,
    restart: false,
    ops: [svc('RetailDemo', 'Manual')],
    recommend: always
  },
  {
    id: 'win-svc-maps',
    os: 'windows',
    category: 'services',
    title: 'Gestionnaire des cartes téléchargées',
    description: 'Met à jour les cartes hors connexion de l’app Cartes en arrière-plan.',
    tradeoff: 'Les cartes hors connexion ne se mettront plus à jour.',
    risk: 'safe',
    admin: true,
    restart: false,
    ops: [svc('MapsBroker', 'Automatic')],
    recommend: always
  },
  {
    id: 'win-svc-insider',
    os: 'windows',
    category: 'services',
    title: 'Programme Windows Insider',
    description: 'Service des versions de test de Windows.',
    tradeoff: 'À laisser si tu es inscrit au programme Insider.',
    risk: 'safe',
    admin: true,
    restart: false,
    ops: [svc('wisvc', 'Manual')],
    recommend: always
  },
  {
    id: 'win-svc-xbox',
    os: 'windows',
    category: 'services',
    title: 'Services Xbox Live',
    description: 'Connexion Xbox, sauvegardes cloud Xbox et réseau Xbox.',
    tradeoff: '⚠️ Casse le Game Pass, les jeux du Microsoft Store / Xbox et leurs sauvegardes cloud. Les manettes Xbox continuent de marcher.',
    risk: 'moderate',
    admin: true,
    restart: false,
    ops: [svc('XblAuthManager', 'Manual'), svc('XblGameSave', 'Manual'), svc('XboxNetApiSvc', 'Manual')],
    recommend: never
  },
  {
    id: 'win-svc-spooler',
    os: 'windows',
    category: 'services',
    title: "Spouleur d'impression",
    description: "Service d'impression (aussi une faille de sécurité connue quand il n’est pas utilisé).",
    tradeoff: '⚠️ Plus aucune impression possible, ni « Imprimer en PDF ».',
    risk: 'moderate',
    admin: true,
    restart: false,
    ops: [svc('Spooler', 'Automatic')],
    recommend: never
  },

  // ─── macOS ───────────────────────────────────────────────────────
  {
    id: 'mac-ads',
    os: 'mac',
    category: 'privacy',
    title: 'Publicité personnalisée Apple',
    description: 'Apple ne cible plus ses pubs (App Store, Apple News) selon ton activité.',
    tradeoff: null,
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [{ t: 'defaults', domain: 'com.apple.AdLib', key: 'allowApplePersonalizedAdvertising', type: 'bool', value: 'false', def: null }],
    recommend: always
  },
  {
    id: 'mac-lookup',
    os: 'mac',
    category: 'privacy',
    title: 'Suggestions Spotlight en ligne',
    description: 'Ce que tu tapes dans Spotlight et « Rechercher » n’est plus envoyé à Apple.',
    tradeoff: 'Plus de suggestions web dans Spotlight.',
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [{ t: 'defaults', domain: 'com.apple.lookup.shared', key: 'LookupSuggestionsDisabled', type: 'bool', value: 'true', def: null }],
    recommend: always
  },
  {
    id: 'mac-crash',
    os: 'mac',
    category: 'interface',
    title: 'Fenêtres de rapport de plantage',
    description: 'Plus de fenêtre « L’app a quitté inopinément » à chaque plantage.',
    tradeoff: null,
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [{ t: 'defaults', domain: 'com.apple.CrashReporter', key: 'DialogType', type: 'string', value: 'none', def: null }],
    recommend: never
  },
  {
    id: 'mac-animations',
    os: 'mac',
    category: 'performance',
    title: 'Animations réduites',
    description: 'Fenêtres et apps du Dock s’ouvrent sans animation.',
    tradeoff: 'Le Dock redémarre (une seconde).',
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [
      { t: 'defaults', domain: 'NSGlobalDomain', key: 'NSAutomaticWindowAnimationsEnabled', type: 'bool', value: 'false', def: null },
      { t: 'defaults', domain: 'com.apple.dock', key: 'launchanim', type: 'bool', value: 'false', def: null, restart: 'Dock' }
    ],
    recommend: never
  },
  {
    id: 'mac-dsstore',
    os: 'mac',
    category: 'performance',
    title: 'Pas de .DS_Store sur le réseau et l’USB',
    description: 'Le Finder n’écrit plus de fichiers cachés sur les partages réseau et clés USB : navigation plus rapide.',
    tradeoff: null,
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [
      { t: 'defaults', domain: 'com.apple.desktopservices', key: 'DSDontWriteNetworkStores', type: 'bool', value: 'true', def: null },
      { t: 'defaults', domain: 'com.apple.desktopservices', key: 'DSDontWriteUSBStores', type: 'bool', value: 'true', def: null }
    ],
    recommend: always
  },

  // ─── Linux (GNOME) ───────────────────────────────────────────────
  {
    id: 'linux-location',
    os: 'linux',
    category: 'privacy',
    title: 'Géolocalisation désactivée',
    description: 'Les apps ne peuvent plus demander ta position.',
    tradeoff: 'Météo locale et fuseau horaire automatique ne fonctionneront plus.',
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [{ t: 'gsettings', schema: 'org.gnome.system.location', key: 'enabled', value: 'false', def: 'true' }],
    recommend: always
  },
  {
    id: 'linux-reports',
    os: 'linux',
    category: 'privacy',
    title: 'Rapports techniques et statistiques',
    description: 'Plus d’envoi automatique de rapports de problèmes ni de statistiques d’usage.',
    tradeoff: null,
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [
      { t: 'gsettings', schema: 'org.gnome.desktop.privacy', key: 'report-technical-problems', value: 'false', def: 'true' },
      { t: 'gsettings', schema: 'org.gnome.desktop.privacy', key: 'send-software-usage-stats', value: 'false', def: 'true' }
    ],
    recommend: always
  },
  {
    id: 'linux-animations',
    os: 'linux',
    category: 'performance',
    title: 'Animations désactivées',
    description: 'Interface GNOME plus réactive, moins de travail pour le GPU.',
    tradeoff: null,
    risk: 'safe',
    admin: false,
    restart: false,
    ops: [{ t: 'gsettings', schema: 'org.gnome.desktop.interface', key: 'enable-animations', value: 'false', def: 'true' }],
    recommend: (hw) => hw.laptop
  }
]
