"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./Icons";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}

export function Modal({ isOpen, onClose, title, children, wide }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[1px]"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className={`relative flex max-h-[90vh] flex-col overflow-hidden rounded-hx-lg border border-line-strong bg-bg shadow-hx-lg ${
          wide ? "w-full max-w-4xl" : "w-full max-w-2xl"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-ink-1">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-hx-sm p-1 text-ink-muted hover:bg-bg-muted hover:text-ink-1"
            aria-label="Cerrar"
          >
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
