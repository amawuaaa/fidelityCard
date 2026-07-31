import { useState } from "react";
import { Lock, LogIn } from "lucide-react";
import { BRAND } from "../config/brand.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { loginAdmin } from "../lib/adminAuth.js";

/**
 * Pantalla de acceso al panel barista.
 * Con Supabase: email + password (Auth).
 * Sin Supabase / respaldo: PIN (VITE_ADMIN_PIN).
 */
export default function AdminLogin({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const useEmailAuth = isSupabaseConfigured;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await loginAdmin(email, password);
      onSuccess?.();
    } catch (err) {
      console.error(err);
      setError(
        err.message === "Invalid login credentials"
          ? "Email o contraseña incorrectos"
          : err.message || "No se pudo iniciar sesión",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-sm">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[#178e3c]/10">
          <Lock className="size-7 text-[#178e3c]" strokeWidth={2.5} />
        </div>

        <h1 className="text-center text-xl font-extrabold text-gray-900">
          Acceso barista
        </h1>
        <p className="mt-1 text-center text-sm text-gray-500">
          {BRAND.productName} · solo personal del café
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          {useEmailAuth && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400">
                Email
              </span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="barista@tucafe.com"
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#178e3c]"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400">
              {useEmailAuth ? "Contraseña" : "PIN de acceso"}
            </span>
            <input
              type="password"
              autoComplete={useEmailAuth ? "current-password" : "one-time-code"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={useEmailAuth ? "••••••••" : "PIN"}
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#178e3c]"
            />
          </label>

          {error && (
            <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#178e3c] py-3.5 text-base font-bold text-white hover:bg-[#136f2f] disabled:opacity-60"
          >
            <LogIn className="size-5" strokeWidth={2.5} />
            {loading ? "Entrando…" : "Entrar al panel"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400">
          Acceso solo para personal autorizado
        </p>

        <a
          href="#"
          className="mt-3 block text-center text-xs font-semibold text-gray-400 hover:text-[#178e3c]"
        >
          ← Volver a la tarjeta
        </a>
      </div>
    </div>
  );
}
