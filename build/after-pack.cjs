const path = require('path')
const { execFileSync } = require('child_process')

// Ad-hoc sign the macOS bundle.
//
// CI builds with CSC_IDENTITY_AUTO_DISCOVERY=false (no Apple certificate), which
// leaves the bundle with no signature at all. On Apple Silicon macOS then reports
// "AICycle Widget.app is damaged and can't be opened" and refuses to launch it —
// and unlike the usual Gatekeeper prompt, that one has no "open anyway" path, so
// removing the quarantine flag alone does not rescue it.
//
// An ad-hoc signature (`--sign -`) is not a trusted identity and does not
// notarize anything; it just gives the bundle a valid self-signature, which
// downgrades "damaged" to the normal, bypassable warning.
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  console.log('afterPack: ad-hoc signed', appPath)
}
