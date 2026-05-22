"use client";
import { useCallback, useEffect, useState } from "react";

export interface CustomServicePreset {
  id: string;
  name: string;
  defaultTarget: string | null;
  createdAt: string;
}

export function useServicePresets() {
  const [presets, setPresets] = useState<CustomServicePreset[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/service-presets");
      if (res.ok) setPresets((await res.json()).presets);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (name: string, defaultTarget?: string | null): Promise<CustomServicePreset | null> => {
    const res = await fetch("/api/service-presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), defaultTarget: defaultTarget ?? null }),
    });
    if (!res.ok) return null;
    const preset = (await res.json()) as CustomServicePreset;
    setPresets((prev) => {
      const exists = prev.some((p) => p.id === preset.id);
      return exists ? prev : [...prev, preset].sort((a, b) => a.name.localeCompare(b.name));
    });
    return preset;
  }, []);

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/service-presets/${id}`, { method: "DELETE" });
    if (res.ok) setPresets((prev) => prev.filter((p) => p.id !== id));
    return res.ok;
  }, []);

  return { presets, loading, refresh, create, remove };
}
