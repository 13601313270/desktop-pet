import { app, BrowserWindow, ipcMain } from 'electron'
// import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

// const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

const showDev = true;

// macOS 透明窗口兼容性：禁用 GPU 合成避免白色叠加
app.commandLine.appendSwitch('disable-gpu-compositing')

function createWindow() {
  win = new BrowserWindow({
    width: showDev ? 1200 : 300,
    height: showDev ? 500 : 300,

    frame: false,
    transparent: true,
    backgroundColor: '#00000000',

    resizable: false,

    alwaysOnTop: true,
    hasShadow: false,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
  if (showDev) {
    win.webContents.openDevTools()
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 下载远端模型到本地持久化（渲染进程无文件系统写权限，必须走主进程）
ipcMain.handle('download-pet-model', async (_event, url: string) => {
  try {
    const dir = path.join(app.getPath('userData'), 'pets')
    fs.mkdirSync(dir, { recursive: true })
    const dest = path.join(dir, 'custom_dog.glb')
    const resp = await fetch(url)
    if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` }
    const buf = Buffer.from(await resp.arrayBuffer())
    fs.writeFileSync(dest, buf)
    return { success: true, path: dest }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
})

// 读取本地模型为 ArrayBuffer，供渲染进程 GLTFLoader.parse 使用
ipcMain.handle('read-pet-model', async (_event, filePath: string) => {
  const buf = fs.readFileSync(filePath)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
})

// 删除本地持久化的模型文件
ipcMain.handle('delete-pet-model', async (_event, filePath: string) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
})

app.whenReady().then(createWindow)
