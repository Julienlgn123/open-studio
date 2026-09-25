import { createServer, type Server } from 'http'
import { AddressInfo } from 'net'
import { shell } from 'electron'
import { google } from 'googleapis'
import { getGoogleCredentials } from '../settings'

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>
import { getAccountTokens, setAccountTokens } from '../db'

// Scopes : accès complet aux fichiers créés/gérés par l'app + e-mail du compte.
export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
]

const SUCCESS_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Compte lié</title>
<style>body{font-family:system-ui,sans-serif;background:#0d0d0f;color:#fff;display:flex;
align-items:center;justify-content:center;height:100vh;margin:0}
.card{background:#1a1a1f;border:1px solid rgba(255,255,255,.1);border-radius:14px;
padding:32px 40px;text-align:center;max-width:360px}
h1{font-size:18px;margin:0 0 8px}p{color:rgba(255,255,255,.55);font-size:14px;margin:0}</style>
</head><body><div class="card"><h1>✓ Compte Google lié</h1>
<p>Vous pouvez fermer cet onglet et revenir à Drive Studio.</p></div></body></html>`

function createOAuthClient(redirectUri: string): OAuth2Client {
  const creds = getGoogleCredentials()
  if (!creds) {
    throw new Error(
      'Identifiants Google non configurés. Renseigne ton Client ID / Client Secret dans Réglages.'
    )
  }
  return new google.auth.OAuth2(creds.clientId, creds.clientSecret, redirectUri)
}

/**
 * Lance le flow OAuth loopback :
 *  - démarre un serveur http éphémère sur 127.0.0.1
 *  - ouvre le navigateur système sur la page de consentement Google
 *  - récupère le "code" via la redirection et l'échange contre des tokens
 *
 * Résout avec les tokens + l'e-mail du compte.
 */
export function runOAuthFlow(): Promise<{
  tokens: { accessToken: string; refreshToken: string; expiry: number }
  email: string
}> {
  return new Promise((resolve, reject) => {
    let server: Server | null = null
    const timeout = setTimeout(
      () => {
        cleanup()
        reject(new Error("Délai d'authentification dépassé (5 min)."))
      },
      5 * 60 * 1000
    )

    function cleanup(): void {
      clearTimeout(timeout)
      if (server) {
        server.close()
        server = null
      }
    }

    try {
      server = createServer(async (req, res) => {
        try {
          if (!req.url) return
          const url = new URL(req.url, 'http://127.0.0.1')
          if (url.pathname !== '/') {
            res.writeHead(404)
            res.end()
            return
          }
          const error = url.searchParams.get('error')
          if (error) {
            res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('Autorisation refusée : ' + error)
            cleanup()
            reject(new Error('Autorisation refusée : ' + error))
            return
          }
          const code = url.searchParams.get('code')
          if (!code) {
            res.writeHead(400)
            res.end('code manquant')
            return
          }

          const addr = server!.address() as AddressInfo
          const redirectUri = `http://127.0.0.1:${addr.port}`
          const client = createOAuthClient(redirectUri)
          const { tokens } = await client.getToken(code)
          client.setCredentials(tokens)

          const oauth2 = google.oauth2({ version: 'v2', auth: client })
          const me = await oauth2.userinfo.get()
          const email = me.data.email || 'compte-inconnu'

          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          res.end(SUCCESS_HTML)
          cleanup()

          if (!tokens.refresh_token) {
            reject(
              new Error(
                "Google n'a pas renvoyé de refresh_token. Révoque l'accès de l'app dans " +
                  'ton compte Google puis relie le compte.'
              )
            )
            return
          }

          resolve({
            tokens: {
              accessToken: tokens.access_token || '',
              refreshToken: tokens.refresh_token,
              expiry: tokens.expiry_date || Date.now() + 3500 * 1000
            },
            email
          })
        } catch (err) {
          res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('Erreur : ' + (err instanceof Error ? err.message : String(err)))
          cleanup()
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })

      server.on('error', (err) => {
        cleanup()
        reject(err)
      })

      server.listen(0, '127.0.0.1', () => {
        const addr = server!.address() as AddressInfo
        const redirectUri = `http://127.0.0.1:${addr.port}`
        const client = createOAuthClient(redirectUri)
        const authUrl = client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: SCOPES
        })
        shell.openExternal(authUrl)
      })
    } catch (err) {
      cleanup()
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

/**
 * Renvoie un client OAuth2 authentifié pour un compte, en rafraîchissant
 * le token si besoin. Les nouveaux tokens sont ré-écrits chiffrés en base.
 */
export async function getAuthedClient(
  accountId: string,
  opts: { forceRefresh?: boolean } = {}
): Promise<OAuth2Client> {
  const creds = getGoogleCredentials()
  if (!creds) throw new Error('Identifiants Google non configurés.')
  const stored = getAccountTokens(accountId)
  if (!stored) throw new Error('Compte introuvable : ' + accountId)

  const client = new google.auth.OAuth2(creds.clientId, creds.clientSecret)
  client.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expiry_date: stored.expiry
  })

  // Persiste les tokens rafraîchis automatiquement.
  client.on('tokens', (tokens) => {
    setAccountTokens(accountId, {
      accessToken: tokens.access_token || undefined,
      refreshToken: tokens.refresh_token || undefined,
      expiry: tokens.expiry_date || undefined
    })
  })

  // Force un refresh si demandé explicitement, ou si le token expire dans moins de 2 min.
  if (opts.forceRefresh || !stored.expiry || stored.expiry - Date.now() < 120_000) {
    const res = await client.getAccessToken()
    if (res.token) {
      setAccountTokens(accountId, { accessToken: res.token })
    }
  }

  return client
}

/** Révoque l'accès OAuth d'un compte auprès de Google (best effort). */
export async function revokeAccount(accountId: string): Promise<void> {
  try {
    const stored = getAccountTokens(accountId)
    if (!stored?.refreshToken) return
    const client = new google.auth.OAuth2()
    await client.revokeToken(stored.refreshToken)
  } catch {
    // best effort — le compte est retiré localement quoi qu'il arrive
  }
}
