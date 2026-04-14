"use client";

import { useEffect, useState } from "react";

export interface ToastMessage {
  id: string;
  text: string;
  userName?: string;
  type?: "info" | "success" | "warning";
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
    // Auto-dismiss after 4s
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const bgColor =
    toast.type === "warning"
      ? "bg-amber-50 border-amber-200 text-amber-800"
      : toast.type === "success"
        ? "bg-green-50 border-green-200 text-green-800"
        : "bg-blue-50 border-blue-200 text-blue-800";

  return (
    <div
      className={`transform rounded-lg border px-4 py-2.5 shadow-lg transition-all duration-300 ${bgColor} ${
        visible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
      }`}
    >
      <div className="flex items-center gap-2 text-sm">
        {toast.userName && (
          <span className="font-semibold">{toast.userName}</span>
        )}
        <span>{toast.text}</span>
      </div>
    </div>
  );
}
