"use client";
// Barra de fichaje de turno (sticky bajo el header de la home).

import { useEffect, useRef, useState } from "react";
import { HelixButton } from "@/components/helix";
import { Clock, LogOut, Users } from "lucide-react";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { SHIFT_POSTS, SHIFT_POST_LABELS, type ShiftPost } from "@/types";
import { useShift, type ShiftDTO } from "@/hooks/useShift";

export interface ShiftBarProps {
  onShiftChange?: (myShift: ShiftDTO | null) => void;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? parts[1][0] ?? "" : "";
  return (first + second).toUpperCase() || "?";
}

function postsLabel(posts: ShiftPost[]): string {
  return posts.map((p) => SHIFT_POST_LABELS[p]).join(", ");
}

export function ShiftBar({ onShiftChange }: ShiftBarProps) {
  const isMobile = useIsMobile();
  const { myShift, activeShifts, loading, clockIn, setPosts, clockOut } = useShift();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onShiftChange?.(myShift);
  }, [myShift, onShiftChange]);

  const others = activeShifts.filter((s) => !myShift || s.id !== myShift.id);

  const handleClockIn = async (posts: ShiftPost[]) => {
    setBusy(true);
    try {
      await clockIn(posts);
    } catch (err) {
      console.error("[ShiftBar] clockIn", err);
    } finally {
      setBusy(false);
    }
  };

  const handleSetPosts = async (posts: ShiftPost[]) => {
    setBusy(true);
    try {
      await setPosts(posts);
    } catch (err) {
      console.error("[ShiftBar] setPosts", err);
    } finally {
      setBusy(false);
    }
  };

  const handleClockOut = async () => {
    setBusy(true);
    try {
      await clockOut();
    } catch (err) {
      console.error("[ShiftBar] clockOut", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-hx-md border border-line bg-bg px-3 py-2 shadow-hx-lg">
      {myShift === null ? (
        <PostSelector
          mode="start"
          disabled={loading || busy}
          onConfirm={handleClockIn}
        />
      ) : (
        <>
          <PostSelector
            mode="edit"
            current={myShift.posts}
            disabled={loading || busy}
            onConfirm={handleSetPosts}
          />

          <div className="ml-auto flex items-center gap-2">
            <ActiveShifts others={others} isMobile={isMobile} />
            <HelixButton
              variant="ghost"
              size="sm"
              onClick={handleClockOut}
              disabled={busy}
              title="Cerrar tu turno"
              className="text-danger"
            >
              <LogOut size={14} /> {isMobile ? "" : "Cerrar turno"}
            </HelixButton>
          </div>
        </>
      )}
    </div>
  );
}

function PostSelector({
  mode,
  current,
  disabled,
  onConfirm,
}: {
  mode: "start" | "edit";
  current?: ShiftPost[];
  disabled?: boolean;
  onConfirm: (posts: ShiftPost[]) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ShiftPost[]>(current ?? []);
  const ref = useRef<HTMLDivElement>(null);

  // Re-sincroniza con los puestos vigentes al abrir.
  useEffect(() => {
    if (open) setSelected(current ?? []);
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (post: ShiftPost) =>
    setSelected((prev) =>
      prev.includes(post) ? prev.filter((p) => p !== post) : [...prev, post],
    );

  const confirm = async () => {
    if (selected.length === 0) return;
    await onConfirm(selected);
    setOpen(false);
  };

  const item =
    "flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left text-sm text-ink-2 hover:bg-bg-muted";

  return (
    <div className="relative" ref={ref}>
      {mode === "start" ? (
        <HelixButton
          variant="primary"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Clock size={14} /> Iniciar turno
        </HelixButton>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex flex-wrap items-center gap-1.5 rounded-hx-md px-1 py-0.5 hover:bg-bg-muted disabled:opacity-60"
          title="Cambiar puestos"
        >
          <Clock size={14} className="text-ink-3" />
          {(current ?? []).length === 0 ? (
            <span className="text-sm text-ink-3">Sin puesto</span>
          ) : (
            (current ?? []).map((p) => (
              <span key={p} className="hx-pill hx-pill-default">
                {SHIFT_POST_LABELS[p]}
              </span>
            ))
          )}
        </button>
      )}

      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 min-w-[220px] rounded-hx-md border border-line bg-bg py-1 shadow-hx-lg"
        >
          <p className="px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">
            {mode === "start" ? "Elige tus puestos" : "Cambiar puestos"}
          </p>
          {SHIFT_POSTS.map((post) => {
            const checked = selected.includes(post);
            return (
              <label key={post} className={item}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(post)}
                  className="h-4 w-4 accent-current"
                />
                <span>{SHIFT_POST_LABELS[post]}</span>
              </label>
            );
          })}
          <div className="mx-2 my-1 border-t border-line-subtle" />
          <div className="flex items-center justify-end gap-2 px-3 py-2">
            <HelixButton variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </HelixButton>
            <HelixButton
              variant="primary"
              size="sm"
              onClick={confirm}
              disabled={selected.length === 0 || disabled}
            >
              {mode === "start" ? "Fichar" : "Guardar"}
            </HelixButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActiveShifts({ others, isMobile }: { others: ShiftDTO[]; isMobile: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (others.length === 0) {
    return <span className="text-xs text-ink-3">Solo tú en turno</span>;
  }

  // Desktop: iniciales en círculos con tooltip.
  if (!isMobile) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-ink-3">En turno:</span>
        <div className="flex items-center -space-x-1.5">
          {others.map((s) => (
            <span
              key={s.id}
              title={`${s.userName} — ${postsLabel(s.posts)}`}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-line bg-bg-muted text-[10px] font-semibold text-ink-2"
            >
              {initialsOf(s.userName)}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Móvil: contador "+N en turno" con detalle al tocar.
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-hx-md px-2 py-1 text-xs text-ink-2 hover:bg-bg-muted"
      >
        <Users size={13} /> +{others.length} en turno
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-hx-md border border-line bg-bg py-1 shadow-hx-lg"
        >
          {others.map((s) => (
            <div key={s.id} className="px-4 py-2 text-sm">
              <p className="font-medium text-ink-1">{s.userName}</p>
              <p className="text-xs text-ink-3">{postsLabel(s.posts)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
