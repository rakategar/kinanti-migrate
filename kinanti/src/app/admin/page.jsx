"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FiPlus,
  FiTrash2,
  FiRefreshCw,
  FiLogOut,
  FiRotateCcw,
  FiKey,
} from "react-icons/fi";

function StatusBadge({ status, cooldownUntil }) {
  const now = Date.now();
  const cooling = cooldownUntil && new Date(cooldownUntil).getTime() > now;
  let cls = "bg-green-100 text-green-700";
  let label = "OK";
  if (status === "limited" || cooling) {
    cls = "bg-amber-100 text-amber-700";
    label = "Limited";
  } else if (status === "error") {
    cls = "bg-red-100 text-red-700";
    label = "Error";
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
      {cooling && (
        <span className="ml-1 opacity-70">
          s/d {new Date(cooldownUntil).toLocaleTimeString("id-ID")}
        </span>
      )}
    </span>
  );
}

export default function AdminTokensPage() {
  const [authed, setAuthed] = useState(null); // null=loading, false=login, true=ok
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // login form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // add token form
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [priority, setPriority] = useState(0);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/tokens", { cache: "no-store" });
      if (res.status === 401) {
        setAuthed(false);
        return;
      }
      const data = await res.json();
      setTokens(data.tokens || []);
      setAuthed(true);
    } catch {
      setMsg("Gagal memuat token.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  async function handleLogin(e) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      setUsername("");
      setPassword("");
      await loadTokens();
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error || "Login gagal.");
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setTokens([]);
  }

  async function handleAdd(e) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, apiKey, priority: Number(priority) }),
    });
    if (res.ok) {
      setLabel("");
      setApiKey("");
      setPriority(0);
      await loadTokens();
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error || "Gagal menambah token.");
    }
  }

  async function patchToken(id, payload) {
    const res = await fetch(`/api/admin/tokens/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error || "Gagal memperbarui token.");
    }
    await loadTokens();
  }

  async function deleteToken(id, name) {
    if (!window.confirm(`Hapus token "${name}"?`)) return;
    const res = await fetch(`/api/admin/tokens/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error || "Gagal menghapus token.");
    }
    await loadTokens();
  }

  // ---------- LOGIN VIEW ----------
  if (authed === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-violet-700">
            <FiKey size={22} />
            <h1 className="text-lg font-semibold">Admin — Token AI</h1>
          </div>
          <p className="text-sm text-gray-500">
            Masuk untuk mengelola pool token AI (Gemini) yang dipakai sistem Kinanti.
          </p>
          <input
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            type="password"
            className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {msg && <p className="text-sm text-red-600">{msg}</p>}
          <button
            type="submit"
            className="w-full rounded-lg bg-violet-600 text-white py-2 hover:bg-violet-700"
          >
            Masuk
          </button>
        </form>
      </div>
    );
  }

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Memuat…
      </div>
    );
  }

  // ---------- DASHBOARD VIEW ----------
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FiKey /> Token AI Switcher
            </h1>
            <p className="text-gray-600 text-sm">
              Kumpulan API key Gemini. Sistem memakai key sesuai prioritas; saat kena
              limit (429) otomatis pindah ke key berikutnya.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadTokens}
              className="inline-flex items-center px-3 py-2 rounded-md border bg-white hover:bg-gray-50"
            >
              <FiRefreshCw className="mr-2" /> Refresh
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center px-3 py-2 rounded-md bg-gray-800 text-white hover:bg-black"
            >
              <FiLogOut className="mr-2" /> Keluar
            </button>
          </div>
        </div>

        {/* Form tambah token */}
        <form
          onSubmit={handleAdd}
          className="mt-6 bg-white rounded-xl shadow p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
        >
          <div className="md:col-span-3">
            <label className="text-xs text-gray-500">Label</label>
            <input
              className="w-full rounded-lg border px-3 py-2"
              placeholder="mis. Akun Gemini 1"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="md:col-span-6">
            <label className="text-xs text-gray-500">API Key (Gemini)</label>
            <input
              className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
              placeholder="AIza…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className="md:col-span-1">
            <label className="text-xs text-gray-500">Prioritas</label>
            <input
              type="number"
              className="w-full rounded-lg border px-3 py-2"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              title="Makin kecil = didahulukan"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center px-3 py-2 rounded-md bg-violet-600 text-white hover:bg-violet-700"
            >
              <FiPlus className="mr-2" /> Tambah
            </button>
          </div>
        </form>

        {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}

        {/* Tabel token */}
        <div className="mt-6 bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="p-3">Prioritas</th>
                <th className="p-3">Label</th>
                <th className="p-3">Key</th>
                <th className="p-3">Status</th>
                <th className="p-3">Dipakai</th>
                <th className="p-3">Terakhir</th>
                <th className="p-3">Aktif</th>
                <th className="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {tokens.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-400">
                    {loading ? "Memuat…" : "Belum ada token. Tambahkan minimal satu key Gemini."}
                  </td>
                </tr>
              )}
              {tokens.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-3">
                    <input
                      type="number"
                      defaultValue={t.priority}
                      className="w-16 rounded border px-2 py-1"
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== t.priority) patchToken(t.id, { priority: v });
                      }}
                    />
                  </td>
                  <td className="p-3 font-medium">{t.label}</td>
                  <td className="p-3 font-mono text-xs text-gray-500">{t.keyMasked}</td>
                  <td className="p-3">
                    <StatusBadge status={t.status} cooldownUntil={t.cooldownUntil} />
                    {t.lastError && (
                      <div className="text-[10px] text-red-400 max-w-[200px] truncate" title={t.lastError}>
                        {t.lastError}
                      </div>
                    )}
                  </td>
                  <td className="p-3">{t.usageCount}×</td>
                  <td className="p-3 text-gray-500">
                    {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString("id-ID") : "—"}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => patchToken(t.id, { active: !t.active })}
                      className={`px-2 py-1 rounded text-xs ${
                        t.active ? "bg-green-600 text-white" : "bg-gray-300 text-gray-700"
                      }`}
                    >
                      {t.active ? "Aktif" : "Nonaktif"}
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => patchToken(t.id, { reset: true })}
                        className="p-2 rounded hover:bg-amber-50 text-amber-600"
                        title="Reset status/cooldown"
                      >
                        <FiRotateCcw />
                      </button>
                      <button
                        onClick={() => deleteToken(t.id, t.label)}
                        className="p-2 rounded hover:bg-red-50 text-red-600"
                        title="Hapus"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
