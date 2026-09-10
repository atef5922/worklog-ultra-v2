const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("worklogDesktop", {
  isDesktop: true,
  startTracking: (input) => ipcRenderer.invoke("screenshot:start", input),
  stopTracking: (input) => ipcRenderer.invoke("screenshot:stop", input),
  pauseTracking: () => ipcRenderer.invoke("screenshot:pause"),
  resumeTracking: () => ipcRenderer.invoke("screenshot:resume"),
  getTrackerStatus: () => ipcRenderer.invoke("screenshot:status"),
  onTrackerStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("screenshot:status", listener);
    return () => ipcRenderer.removeListener("screenshot:status", listener);
  },
  onAppQuit: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("app:quit", listener);
    return () => ipcRenderer.removeListener("app:quit", listener);
  },
  saveCredentials: (email, password) => ipcRenderer.invoke("credentials:save", { email, password }),
  loadCredentials: () => ipcRenderer.invoke("credentials:load"),
  clearCredentials: () => ipcRenderer.invoke("credentials:clear"),
});
