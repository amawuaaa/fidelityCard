import { Coffee, PartyPopper, Sparkles } from "lucide-react";

/**
 * Celebración al completar un cartón (6/6) + CTA para empezar uno nuevo.
 */
export default function CardCompleteModal({
  open,
  publicId,
  cardsCompleted,
  onStartNew,
  onClose,
  busy,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white p-6 text-center shadow-xl">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="absolute left-6 top-8 size-3 animate-bounce rounded-full bg-[#178e3c]/40" />
          <span className="absolute right-8 top-12 size-2 animate-pulse rounded-full bg-amber-400" />
          <span className="absolute bottom-20 left-10 size-2.5 animate-ping rounded-full bg-[#178e3c]/30" />
          <span className="absolute bottom-24 right-12 size-3 animate-bounce rounded-full bg-amber-300/80 [animation-delay:200ms]" />
        </div>

        <div className="relative mx-auto mb-4 flex size-20 items-center justify-center rounded-full bg-[#178e3c] shadow-lg shadow-[#178e3c]/30">
          <PartyPopper className="size-10 text-white" strokeWidth={2.25} />
        </div>

        <h3 className="relative text-2xl font-extrabold text-gray-900">
          ¡Cartón completado!
        </h3>
        <p className="relative mt-2 text-sm font-medium text-gray-500">
          {publicId ? (
            <>
              <span className="font-bold text-gray-800">{publicId}</span> ganó un
              café gratis.
            </>
          ) : (
            "Ganaste un café gratis."
          )}
        </p>

        <div className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-[#178e3c]/10 px-4 py-2 text-sm font-extrabold text-[#178e3c]">
          <Coffee className="size-4" strokeWidth={2.5} />
          {cardsCompleted}{" "}
          {cardsCompleted === 1 ? "cartón completado" : "cartones completados"}
        </div>

        <p className="relative mt-5 text-sm text-gray-500">
          ¿Quieres empezar un cartón nuevo ahora?
        </p>

        <div className="relative mt-4 space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={onStartNew}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#178e3c] py-4 text-base font-bold text-white shadow-sm transition hover:bg-[#136f2f] disabled:opacity-60"
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
