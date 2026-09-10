type WorklogTrackerStatus = {
  state: "STOPPED" | "ACTIVE" | "PAUSED";
  running: boolean;
  paused: boolean;
  userId: string | null;
  label: string | null;
  pending: number;
  intervalMinutes: number;
  nextCaptureAt: number | null;
};

interface Window {
  worklogDesktop?: {
    isDesktop: true;
    startTracking(input: { source: string; label: string; userId: string; taskId: string }): Promise<WorklogTrackerStatus>;
    stopTracking(input: { source: string }): Promise<WorklogTrackerStatus>;
    pauseTracking(): Promise<WorklogTrackerStatus>;
    resumeTracking(): Promise<WorklogTrackerStatus>;
    getTrackerStatus(): Promise<WorklogTrackerStatus>;
    onTrackerStatus(callback: (status: WorklogTrackerStatus) => void): () => void;
    onAppQuit(callback: () => void): () => void;
    saveCredentials(email: string, password: string): Promise<{ ok: boolean }>;
    loadCredentials(): Promise<{ email: string; password: string } | null>;
    clearCredentials(): Promise<{ ok: boolean }>;
  };
}
