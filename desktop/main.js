// NSAMBO — THE BACKROOMS — beta de testes (Windows)
const { app, BrowserWindow, Menu } = require('electron')
const path = require('node:path')

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    title: 'NSAMBO — THE BACKROOMS — BETA',
    autoHideMenuBar: true,
    backgroundColor: '#0b0b0b',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  Menu.setApplicationMenu(null)
  win.loadFile(path.join(__dirname, 'game', 'backrooms.html'))
  win.on('closed', () => { win = null })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
