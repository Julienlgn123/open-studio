const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')

// No paid Apple Developer ID certificate is configured for this project.
// Without any signature at all, macOS refuses to launch the app on
// Apple Silicon ("... is damaged and can't be opened") — electron-builder
// does NOT apply a fallback ad-hoc signature by itself when no certificate
// is found, it just skips signing. So we ad-hoc sign the .app manually
// here, after electron-builder packs it but before it gets put into the
// .dmg. Ad-hoc signing is free and satisfies the arm64 launch requirement,
// even though the app still isn't from an "identified developer" (users
// still need to right-click → Open the first time).
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  if (!fs.existsSync(appPath)) {
    console.warn(`[afterPack] ${appPath} not found, skipping ad-hoc sign`)
    return
  }

  console.log(`[afterPack] Ad-hoc signing ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
