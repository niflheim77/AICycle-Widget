// Render the real renderer bundle (out/renderer) with mock data and capture the
// three README screenshots. Run after `npm run build`:
//   node_modules/.bin/electron tools/shot/capture.cjs
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const INDEX = path.join(ROOT, 'out', 'renderer', 'index.html')
const OUT = path.join(ROOT, 'assets', 'shots')
const W = 300, PAD = 14

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shoot(win, file) {
  // Measure both dimensions: compact mode sizes its width to content too.
  const [w, h] = await win.webContents.executeJavaScript(
    "(r => [Math.ceil(r.width), Math.ceil(r.height)])(document.querySelector('.app').getBoundingClientRect())"
  )
  win.setContentSize(w + PAD * 2, h + PAD * 2)
  await wait(250)
  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, file), img.toPNG())
  console.log('wrote', file, JSON.stringify(img.getSize()))
}

app.commandLine.appendSwitch('force-color-profile', 'srgb')
ipcMain.on('shot-autosize', () => {}) // we size the window manually

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const win = new BrowserWindow({
    width: W + PAD * 2, height: 400, show: true, frame: false, backgroundColor: '#0e0e12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: false, nodeIntegration: false, sandbox: false, backgroundThrottling: false
    }
  })
  await win.loadFile(INDEX)
  await win.webContents.insertCSS(
    'html,body{background:#0e0e12 !important;} body{padding:' + PAD + 'px !important;}' +
    '.app{box-shadow:0 8px 28px rgba(0,0,0,.55);}'
  )
  await wait(600)

  await shoot(win, 'normal.png')

  // The first header icon cycles normal → compact → super compact → normal.
  const cycleDensity = async () => {
    await win.webContents.executeJavaScript("document.querySelectorAll('.drag-actions .icon-btn')[0].click()")
    await wait(400)
  }
  await cycleDensity()
  await shoot(win, 'compact-mode.png')
  await cycleDensity()
  await shoot(win, 'super-compact.png')
  await cycleDensity() // back to normal

  // Settings view → click the gear (3rd header icon now).
  await win.webContents.executeJavaScript("document.querySelectorAll('.drag-actions .icon-btn')[2].click()")
  await wait(350)
  await shoot(win, 'settings.png')

  // Back, then open Claude's detail view (first card).
  await win.webContents.executeJavaScript("document.querySelector('.back-btn').click()")
  await wait(250)
  await win.webContents.executeJavaScript("document.querySelectorAll('.cards .card-click')[0].click()")
  await wait(350)
  await shoot(win, 'detail.png')

  console.log('done')
  app.quit()
})
