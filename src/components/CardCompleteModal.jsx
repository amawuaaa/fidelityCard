import { Coffee, PartyPopper, Sparkles } from "lucide-react";

/**
 * Celebración para el CLIENTE al completar su cartón.
 */
export default function CardCompleteModal({
  open,
  cardsCompleted,
  rewardLabel = "tu café gratis",
  onStartNew,
  onClose,
  busy,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white p-6 text-center shadow-xl">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="absolute left-6 top-8 size-3 animate-bounce rounded-full bg-brand-soft" />
          <span className="absolute right-8 top-12 size-2 animate-pulse rounded-full bg-amber-400" />
          <span className="absolute bottom-20 left-10 size-2.5 animate-ping rounded-full bg-brand-soft" />
          <span className="absolute bottom-24 right-12 size-3 animate-bounce rounded-full bg-amber-300/80 [animation-delay:200ms]" />
        </div>

        <div className="relative mx-auto mb-4 flex size-20 items-center justify-center rounded-full bg-brand shadow-brand">
          <PartyPopper className="size-10 text-white" strokeWidth={2.25} />
        </div>

        <h3 className="relative text-2xl font-extrabold text-gray-900">
          ¡Enhorabuena!
        </h3>
        <p className="relative mt-2 text-sm font-medium text-gray-500">
          Completaste tu cartón. Muestra esto al barista y{" "}
          <span className="font-bold text-gray-800">disfruta {rewardLabel}</span>
          .
        </p>

        <div className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-brand-soft px-4 py-2 text-sm font-extrabold text-brand">
          <Coffee className="size-4" strokeWidth={2.5} />
          {cardsCompleted}{" "}
          {cardsCompleted === 1 ? "cartón completado" : "cartones completados"}
        </div>

        <p className="relative mt-5 text-sm text-gray-500">
          Cuando canjees el gratis, ¿empezamos un cartón nuevo?
        </p>

        <div className="relative mt-4 space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={onStartNew}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-base font-bold text-white shadow-sm transition hover:bg-brand-hover disabled:opacity-60"
          >
            <Sparkles className="size-5" strokeWidth={2.5} />
            {busy ? "Empezando…" : "Sí, nuevo cartón"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-full rounded-2xl bg-stone-100 py-3 text-sm font-bold text-gray-600 hover:bg-stone-200"
          >
            Más tarde
          </button>
        </div>
      </div>
    </div>
  );
}
