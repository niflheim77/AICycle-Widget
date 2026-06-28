import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getLang: () => ipcRenderer.invoke('get-lang'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getSnapshots: () => ipcRenderer.invoke('get-snapshots'),
  refresh: () => ipcRenderer.invoke('refresh'),
  setEnabled: (provider: string, enabled: boolean) =>
    ipcRenderer.invoke('set-enabled', provider, enabled),
  patchSettings: (patch: Record<string, unknown>) =>
    ipcRenderer.invoke('patch-settings', patch),
  autosize: (height: number) => ipcRenderer.send('autosize', height),
  claudeLogin: () => ipcRenderer.invoke('claude-login'),
  claudeLogout: () => ipcRenderer.invoke('claude-logout'),
  quit: () => ipcRenderer.send('quit'),
  onSnapshots: (cb: (data: any) => void) => {
    const listener = (_e: unknown, data: any) => cb(data)
    ipcRenderer.on('snapshots', listener)
    return () => ipcRenderer.removeListener('snapshots', listener)
  },
  onOpenSettings: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('open-settings', listener)
    return () => ipcRenderer.removeListener('open-settings', listener)
  }
}

contextBridge.exposeInMainWorld('aicycle', api)
export type AicycleApi = typeof api
