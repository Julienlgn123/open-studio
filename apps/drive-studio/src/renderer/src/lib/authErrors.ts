/** Traduit une erreur du flow OAuth en message clair et actionnable. */
export function mapAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)

  if (/invalid_client|unauthorized_client/i.test(msg))
    return 'Client ID ou Secret invalide. Vérifie-les dans Réglages (type « Application de bureau »).'

  if (/refresh_token/i.test(msg))
    return "Google n'a pas renvoyé de jeton durable. Va sur myaccount.google.com/permissions, retire l'app, puis relie le compte."

  if (/délai|timeout|dépassé/i.test(msg))
    return (
      "Délai dépassé : l'autorisation n'a pas abouti dans le navigateur. Si tu as vu " +
      '« Accès bloqué · erreur 403 », ajoute le compte en « utilisateur de test » dans ' +
      "l'écran de consentement OAuth, puis réessaie."
    )

  if (/access_denied|denied|refus|validation de Google|utilisateur de test|not.*test user/i.test(msg))
    return (
      "Accès refusé par Google. Cause la plus fréquente : le compte n'est pas dans la liste " +
      '« Utilisateurs de test » de ton écran de consentement OAuth. ' +
      'Ouvre Google Cloud Console → API et services → Écran de consentement OAuth → Audience, ' +
      "ajoute l'adresse du compte comme utilisateur de test, puis réessaie. " +
      '(Ou tu as cliqué « Annuler » dans le navigateur — dans ce cas, relance simplement.)'
    )

  if (/non configuré/i.test(msg)) return msg

  return 'Échec de la liaison : ' + msg
}
