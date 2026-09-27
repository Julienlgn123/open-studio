#!/bin/bash
# Power Studio n'a pas de certificat Apple Developer payant : la build macOS
# n'est signee qu'en ad-hoc. Une fois telechargee, macOS marque l'app en
# quarantaine et Gatekeeper refuse de l'ouvrir ("Power Studio est endommagee").
# Ce script retire cet attribut de quarantaine pour permettre l'ouverture.

DIR="$(cd "$(dirname "$0")" && pwd)"
CANDIDATES=(
  "$DIR/Power Studio.app"
  "/Applications/Power Studio.app"
)

FOUND=0
for APP in "${CANDIDATES[@]}"; do
  if [ -d "$APP" ]; then
    xattr -cr "$APP"
    echo "OK: quarantaine retiree sur $APP"
    FOUND=1
  fi
done

if [ "$FOUND" -eq 0 ]; then
  echo "Power Studio.app introuvable ici ni dans /Applications."
  echo "Lance manuellement dans le Terminal :"
  echo '  xattr -cr "/Applications/Power Studio.app"'
else
  echo ""
  echo "Tu peux maintenant ouvrir Power Studio normalement."
fi

read -p "Appuie sur Entree pour fermer cette fenetre..." _
