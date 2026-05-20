"use client";

import { useEffect, useState } from "react";

export interface ToastMessage {
  id: string;
  text: string;
  userName?: string;
  type?: "info" | "success" | "warning";
  onRetry?: () => void;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));
    // Auto-dismiss: 10s for errors with retry, 4s for normal
    const delay = toast.onRetry ? 10000 : 4000;
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, delay);
    return () => clearTimeout(timer);
  }, [toast.id, toast.onRetry, onDismiss]);

  // Helix toasts: dark base with a 3px coloured left border per type
  // (matches the design-system "toast" pattern). High contrast, low chrome.
  const accent =
    toast.type === "warning"
      ? "border-l-warning"
      : toast.type === "success"
        ? "border-l-success"
        : "border-l-info";

  return (
    <div
      className={`transform rounded-hx-md border-l-[3px] bg-chrome-bg2 px-4 py-2.5 text-chrome-text1 shadow-hx-lg ring-1 ring-chrome-border transition-all duration-300 ${accent} ${
        visible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
      }`}
    >
      <div className="flex items-center gap-2 text-sm">
        {toast.userName && <span className="font-mono font-semibold">{toast.userName}</span>}
        <span className="flex-1">{toast.text}</span>
        {toast.onRetry && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toast.onRetry!();
              onDismiss(toast.id);
            }}
            className="shrink-0 rounded-hx-sm bg-warning px-2 py-0.5 font-mono text-xs font-semibold text-warning-strong hover:brightness-95"
          >
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}
