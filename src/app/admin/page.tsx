"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ROLE_LABELS, Role, ROLES } from "@/types";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "HANDLER" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = session?.user?.role === "ADMIN";
  const isSupervisor = session?.user?.role === "SUPERVISOR";

  // Only admins and supervisors can access
  useEffect(() => {
    if (session && !isAdmin && !isSupervisor) {
      router.push("/");
    }
  }, [session, router, isAdmin, isSupervisor]);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setForm({ name: "", email: "", password: "", role: "HANDLER" });
    setShowForm(false);
    setEditingId(null);
    setError("");
  }

  function startEdit(user: User) {
    setForm({ name: user.name, email: user.email, password: "", role: user.role });
    setEditingId(user.id);
    setShowForm(true);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      if (editingId) {
        // Update
        const body: Record<string, string> = { name: form.name, email: form.email, role: form.role };
        if (form.password) body.password = form.password;
        const res = await fetch(`/api/users/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Error al actualizar");
          return;
        }
        const updated = await res.json();
        setUsers((prev) => prev.map((u) => (u.id === editingId ? updated : u)));
      } else {
        // Create
        if (!form.password) {
          setError("El password es obligatorio para nuevos usuarios");
          return;
        }
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Error al crear usuario");
          return;
        }
        const created = await res.json();
        setUsers((prev) => [...prev, created]);
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Seguro que quieres eliminar este usuario?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } else {
      const data = await res.json();
      alert(data.error || "Error al eliminar");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{isAdmin ? "Administracion" : "Panel supervisor"}</h1>
            <p className="mt-1 text-sm text-gray-500">{isAdmin ? `${users.length} usuarios registrados` : "Gestion de datos"}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Volver
            </button>
            {isAdmin && !showForm && (
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                + Nuevo usuario
              </button>
            )}
          </div>
        </div>

        {/* Create/Edit form — admin only */}
        {isAdmin && showForm && (
          <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">
              {editingId ? "Editar usuario" : "Nuevo usuario"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600">Nombre</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">
                    Password {editingId && <span className="text-gray-400">(dejar vacio para no cambiar)</span>}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required={!editingId}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Rol</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={resetForm} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear usuario"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* User list — admin only */}
        {isAdmin && (
        <div className="space-y-2">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between rounded-lg bg-white px-4 py-3 shadow-sm">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{user.name}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    user.role === "ADMIN" ? "bg-purple-100 text-purple-700" :
                    user.role === "VIEWER" ? "bg-gray-100 text-gray-600" :
                    "bg-blue-100 text-blue-700"
                  }`}>
                    {user.role}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startEdit(user)}
                  className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                >
                  Editar
                </button>
                {user.id !== session?.user?.id && (
                  <button
                    onClick={() => handleDelete(user.id)}
                    className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Data Management — admin and supervisor */}
      <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4">
        <h2 className="text-sm font-bold text-red-700 mb-3">Gestion de datos</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={async () => {
              if (!window.confirm("Eliminar TODOS los vuelos y datos del dia actual?")) return;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const res = await fetch("/api/daysheets");
              const sheets = await res.json();
              const todaySheet = sheets.find((s: { date: string }) => {
                const d = new Date(s.date);
                d.setHours(0, 0, 0, 0);
                return d.getTime() === today.getTime();
              });
              if (todaySheet) {
                await fetch(`/api/daysheets?id=${todaySheet.id}`, { method: "DELETE" });
                alert("Dia eliminado");
              } else {
                alert("No hay datos para hoy");
              }
            }}
            className="rounded bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200"
          >
            Borrar dia actual
          </button>
          <button
            onClick={async () => {
              if (!window.confirm("ATENCION: Esto eliminara TODOS los vuelos, servicios y datos de TODAS las fechas. Continuar?")) return;
              if (!window.confirm("Seguro? Esta accion no se puede deshacer.")) return;
              await fetch("/api/daysheets?all=true", { method: "DELETE" });
              alert("Todos los datos eliminados");
            }}
            className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            Borrar TODOS los datos
          </button>
        </div>
      </div>
    </div>
  );
}
