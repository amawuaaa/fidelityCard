import { Check, Coffee, X } from "lucide-react";

/**
 * Resultado de cliente encontrado (QR o búsqueda) con acción de añadir punto.
 */
export default function CustomerResultCard({
  customer,
  busy,
  onAddStamp,
  onClose,
}) {
  if (!customer) return null;

  const restantes = Math.max(
    0,
    customer.stampsRequired - customer.stampsCount,
  );

  return (
    <section className="mb-8 rounded-3xl bg-white p-5 shadow-sm ring-2 ring-[#178e3c]/20 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Cliente encontrado
          </p>
          <p className="mt-0.5 text-xl font-extrabold text-gray-900">
            {customer.publicId}
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-500">
            {customer.stampsCount} / {customer.stampsRequired} cafés
            {restantes > 0 ? ` · ${restantes} para gratis` : " · ¡Gratis listo!"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-stone-100 p-2 text-gray-500 hover:bg-stone-200"
          aria-label="Cerrar resultado"
        >
          <X className="size-4" strokeWidth={2.5} />
        </button>
      </div>

      <div className="mb-5 grid grid-cols-6 gap-2">
        {Array.from({ length: customer.stampsRequired }).map((_, index) => {
          const filled = index < customer.stampsCount;
          return (
            <div
              key={index}
              className={[
                "flex aspect-square items-center justify-center rounded-full",
                filled ? "bg-[#178e3c]" : "bg-gray-100",
              ].join(" ")}
            >
              <Coffee
                className={filled ? "size-4 text-white" : "size-4 text-gray-300"}
                strokeWidth={2.5}
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={onAddStamp}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#178e3c] py-4 text-base font-bold text-white shadow-sm transition hover:bg-[#136f2f] disabled:opacity-60"
      >
        <Check className="size-5" strokeWidth={2.5} />
        {busy ? "Añadiendo…" : "Añadir 1 punto"}
      </button>
    </section>
  );
}
