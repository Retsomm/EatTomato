import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  shrinkToggle: () => ipcRenderer.invoke('window-shrink-toggle'),
  togglePin: () => ipcRenderer.invoke('window-toggle-pin'),
  onUpdateStatus: (cb: (payload: { type: string; percent?: number }) => void) => {
    ipcRenderer.on('update-status', (_e, payload) => cb(payload))
  },
  todo: {
    getAll: () => ipcRenderer.invoke('todo-get-all'),
    create: (title: string) => ipcRenderer.invoke('todo-create', title),
    addPomodoro: (id: number, minutes: number) => ipcRenderer.invoke('todo-add-pomodoro', id, minutes),
    toggleComplete: (id: number) => ipcRenderer.invoke('todo-toggle-complete', id),
    delete: (id: number) => ipcRenderer.invoke('todo-delete', id),
  },
})
