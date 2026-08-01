import { Check, Coffee, Minus, RefreshCw, Trophy, X } from "lucide-react";
import { useT } from "../i18n/LanguageContext.jsx";

/**
 * Resultado de cliente encontrado (QR o búsqueda) con acción de añadir/quitar punto.
 */
export default function CustomerResultCard({
  customer,
  busy,
  onAddStamp,
  onRemoveStamp,
  onStartNewCard,
  onRefresh,
  onClose,
}) {
  const t = useT();
  if (!customer) return null;

  const completo = customer.stampsCount >= customer.stampsRequired;
  const restantes = Math.max(
    0,
    customer.stampsRequired - customer.stampsCount,
  );
  const canRemove = customer.stampsCount > 0;

  return (
    <section className="mb-8 rounded-3xl bg-white p-5 shadow-sm ring-2 ring-brand-soft sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            {t("result.found")}
          </p>
          <p className="mt-0.5 text-xl font-extrabold tracking-wide text-gray-900">
            {customer.shortCode || customer.publicId}
          </p>
          {customer.shortCode && (
            <p className="mt-0.5 text-xs font-medium text-gray-400">
              {customer.publicId}
            </p>
          )}
          <p className="mt-1 text-sm font-semibold text-gray-500">
            {t("result.cafes", {
              current: customer.stampsCount,
              required: customer.stampsRequired,
            })}
            {completo
              ? ` · ${t("result.complete")}`
              : ` · ${t("result.left", { n: restantes })}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={busy}
              className="rounded-full bg-stone-100 p-2 text-gray-500 hover:bg-stone-200 disabled:opacity-50"
              aria-label={t("result.refresh")}
              title={t("result.refresh")}
            >
              <RefreshCw className="size-4" strokeWidth={2.5} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-stone-100 p-2 text-gray-500 hover:bg-stone-200"
            aria-label={t("result.close")}
          >
            <X className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-6 gap-2">
        {Array.from({ length: customer.stampsRequired }).map((_, index) => {
          const filled = index < customer.stampsCount;
          return (
            <div
              key={index}
              className={[
                "flex aspect-square items-center justify-center rounded-full",
                filled ? "bg-brand" : "bg-gray-100",
                completo && filled ? "animate-pulse" : "",
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

      <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl bg-stone-50 px-3 py-2 text-sm font-bold text-gray-700">
        <Trophy className="size-4 text-brand" strokeWidth={2.5} />
        {customer.cardsCompleted ?? 0}{" "}
        {(customer.cardsCompleted ?? 0) === 1
          ? t("card.cardsOne")
          : t("card.cardsMany")}
      </div>

      {completo ? (
        <div className="space-y-2">
          <p className="text-center text-xs font-medium text-gray-500">
            {t("result.redeemHint")}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onStartNewCard}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-bold text-gray-900 shadow-sm ring-1 ring-stone-200 transition hover:bg-stone-50 disabled:opacity-60"
          >
            {t("result.newOnly", { n: customer.stampsRequired })}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onAddStamp}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-base font-bold text-white shadow-sm transition hover:bg-brand-hover disabled:opacity-60"
          >
            <Check className="size-5" strokeWidth={2.5} />
            {busy ? t("result.processing") : t("result.redeemAdd")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={onAddStamp}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-base font-bold text-white shadow-sm transition hover:bg-brand-hover disabled:opacity-60"
        >
          <Check className="size-5" strokeWidth={2.5} />
          {busy ? t("result.adding") : t("result.add")}
        </button>
      )}

      {canRemove && onRemoveStamp && (
        <button
          type="button"
          disabled={busy}
          onClick={onRemoveStamp}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-100 py-3 text-sm font-bold text-gray-700 transition hover:bg-stone-200 disabled:opacity-60"
        >
          <Minus className="size-4" strokeWidth={2.5} />
          {t("result.remove")}
        </button>
      )}
    </section>
  );
}
