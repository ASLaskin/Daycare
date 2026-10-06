// Renders every logos/*.svg to a transparent 1024px PNG beside it using
// Electron's Chromium. Run: npx electron assets/brand/render.js
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, 'logos');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  win.webContents.setZoomFactor(1);
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(dir, file), 'utf8');
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      `<html><body style="margin:0;background:transparent">${svg}</body></html>`));
    await new Promise((r) => setTimeout(r, 400));
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
    const out = img.getSize().width === 1024 ? img : img.resize({ width: 1024, height: 1024, quality: 'best' });
    const png = file.replace(/\.svg$/, '.png');
    fs.writeFileSync(path.join(dir, png), out.toPNG());
    console.log('wrote', png);
  }
  app.quit();
});
