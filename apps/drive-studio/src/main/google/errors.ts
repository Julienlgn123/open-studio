// Traduit les erreurs Google API (Gaxios) en messages courts et actionnables.
// Sert aussi à éviter que l'objet GaxiosError complet (des dizaines de
// propriétés : config, headers, retryConfig...) ne remonte tel quel jusqu'au
// renderer ou dans les logs console — on ne relance qu'un message clair.

interface GoogleApiErrorShape {
  code?: number | string
  response?: { status?: number }
  errors?: { reason?: string; message?: string }[]
  message?: string
}

export function mapDriveError(err: unknown): string {
  const e = err as GoogleApiErrorShape
  const status = e?.response?.status ?? (typeof e?.code === 'number' ? e.code : undefined)
  const reason = e?.errors?.[0]?.reason

  if (reason === 'insufficientFilePermissions' || status === 403) {
    return (
      "Action refusée par Google Drive (permissions insuffisantes) — ce fichier appartient " +
      "probablement à quelqu'un d'autre (partagé avec toi, ou dans un Drive partagé où tu " +
      "n'as pas les droits de suppression)."
    )
  }
  if (reason === 'notFound' || status === 404) {
    return "Ce fichier n'existe plus sur Google Drive (déjà supprimé ou déplacé ailleurs)."
  }
  if (status === 401) {
    return 'Session Google expirée — reconnecte le compte depuis la page Comptes.'
  }
  if (status === 429) {
    return 'Trop de requêtes envoyées à Google Drive — réessaie dans quelques instants.'
  }
  if (typeof status === 'number' && status >= 500) {
    return 'Google Drive est temporairement indisponible — réessaie dans quelques instants.'
  }
  return e?.message || 'Erreur inconnue avec Google Drive.'
}
