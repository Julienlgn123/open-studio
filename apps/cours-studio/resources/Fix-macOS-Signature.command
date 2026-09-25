#!/bin/bash
# Cours Studio n'a pas de certificat Apple Developer payant : la build macOS
# n'est signee qu'en ad-hoc. Une fois telechargee, macOS marque l'app en
# quarantaine et Gatekeeper refuse de l'ouvrir ("Cours Studio est endommagee").
# Ce script retire cet attribut de quarantaine pour permettre l'ouverture.

DIR="$(cd "$(dirname "$0")" && pwd)"
CANDIDATES=(
  "$DIR/Cours Studio.app"
  "/Applications/Cours Studio.app"
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
  echo "Cours Studio.app introuvable ici ni dans /Applications."
  echo "Lance manuellement dans le Terminal :"
  echo '  xattr -cr "/Applications/Cours Studio.app"'
else
  echo ""
  echo "Tu peux maintenant ouvrir Cours Studio normalement."
fi

read -p "Appuie sur Entree pour fermer cette fenetre..." _
