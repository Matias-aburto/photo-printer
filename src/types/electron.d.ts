export type UpdateStatusPayload =
  | { status: "checking"; message: string }
  | { status: "upToDate"; message: string }
  | { status: "available"; message: string }
  | { status: "downloading"; message: string; progress?: number }
  | { status: "ready"; message: string }
  | { status: "error"; message: string };

declare global {
  interface Window {
    electronAPI?: {
      onUpdateStatus: (callback: (payload: UpdateStatusPayload) => void) => void;
      requestQuitAndInstall: () => Promise<void>;
    };
  }
}
