import { useState } from "react";
import { Search, X } from "lucide-react";

/**
 * Modal para buscar un cliente por código corto (4 dígitos) o usr_….
 */
export default function ManualSearchModal({ open, onClose, onSearch, searching }) {
  const [query, setQuery] = useState("");

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    const value = query.trim();
    if (!value) return;
    onSearch(value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h3 className="text-lg font-bold text-gray-900">Buscar cliente</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-stone-100 p-2 text-gray-600 hover:bg-stone-200"
            aria-label="Cerrar"
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-5">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Código del cliente
            </span>
            <input
              autoFocus
              inputMode="numeric"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ej. 4821"
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-base font-semibold text-gray-900 outline-none ring-brand placeholder:text-gray-400 focus:ring-2"
            />
          </label>

          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-base font-bold text-white shadow-sm transition hover:bg-brand-hover disabled:opacity-60"
          >
            <Search className="size-5" strokeWidth={2.5} />
            {searching ? "Buscando…" : "Buscar"}
          </button>
        </form>
      </div>
    </div>
  );
}
