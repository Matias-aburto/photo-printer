"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UpdateStatusPayload } from "@/types/electron";

export function UpdateStatusBar() {
  const [payload, setPayload] = useState<UpdateStatusPayload | null>(null);
  const [hideUpToDate, setHideUpToDate] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI) return;
    window.electronAPI.onUpdateStatus(setPayload);
  }, []);

  useEffect(() => {
    if (payload?.status === "upToDate") {
      const t = setTimeout(() => setHideUpToDate(true), 4000);
      return () => clearTimeout(t);
    }
    setHideUpToDate(false);
  }, [payload?.status]);

  const handleQuitAndInstall = () => {
    window.electronAPI?.requestQuitAndInstall();
  };

  // Guard for SSR: never access window on the server (Next.js prerender)
  if (typeof window === "undefined") return null;

  const showBar =
    !!window.electronAPI &&
    payload !== null &&
    !(payload.status === "upToDate" && hideUpToDate);

  if (!window.electronAPI) return null;
  // Reserve space so fixed bar doesn't overlap content (only in Electron)
  if (!showBar) return <div className="h-0" aria-hidden />;

  const isChecking = payload.status === "checking";
  const isUpToDate = payload.status === "upToDate";
  const isAvailable = payload.status === "available";
  const isDownloading = payload.status === "downloading";
  const isReady = payload.status === "ready";
  const isError = payload.status === "error";

  return (
    <>
      <div className="h-10 flex-shrink-0" aria-hidden />
      <div
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-3 py-2 text-sm shadow-sm bg-muted/95 backdrop-blur border-b border-border"
      role="status"
      aria-live="polite"
    >
      {isChecking && (
        <>
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">{payload.message}</span>
        </>
      )}
      {isUpToDate && (
        <>
          <Check className="size-4 text-green-600" />
          <span className="text-muted-foreground">{payload.message}</span>
        </>
      )}
      {isAvailable && (
        <>
          <Download className="size-4 text-primary" />
          <span className="text-foreground">{payload.message}</span>
        </>
      )}
      {isDownloading && (
        <>
          <Loader2 className="size-4 animate-spin text-primary" />
          <span className="text-foreground">{payload.message}</span>
          {payload.progress != null && (
            <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min(100, payload.progress)}%` }}
              />
            </div>
          )}
        </>
      )}
      {isReady && (
        <>
          <Check className="size-4 text-green-600" />
          <span className="text-foreground">{payload.message}</span>
          <Button size="sm" onClick={handleQuitAndInstall} className="ml-2">
            Reiniciar ahora
          </Button>
        </>
      )}
      {isError && (
        <>
          <AlertCircle className="size-4 text-destructive" />
          <span className="text-muted-foreground">{payload.message}</span>
        </>
      )}
    </div>
    </>
  );
}
