import { useEffect, useRef, useState } from "react";
import { Coffee, Nfc, Smile, Trophy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { BRAND } from "./config/brand.js";
import { isSupabaseConfigured } from "./lib/supabase.js";
import {
  createNfcRequest,
  ensureCustomerSession,
  startNewCard,
  subscribeLoyaltyCard,
  subscribeNfcRequest,
} from "./lib/loyaltyApi.js";
import CardCompleteModal from "./components/CardCompleteModal.jsx";

export default function LoyaltyCard() {
  const [userSession, setUserSession] = useState(null);
  const [customerId, setCustomerId] = useState(null);
  const [cafeId, setCafeId] = useState(null);
  const [cafeName, setCafeName] = useState(BRAND.cafeName);
  const [cafesComprados, setCafesComprados] = useState(0);
  const [stampsRequired, setStampsRequired] = useState(BRAND.stampsRequired);
  const [cardsCompleted, setCardsCompleted] = useState(0);
  const [esperandoBarista, setEsperandoBarista] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showComplete, setShowComplete] = useState(false);
  const [startingNew, setStartingNew] = useState(false);
  const unsubRequestRef = useRef(null);
  const prevStampsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let unsubCard = () => {};

    (async () => {
      try {
        const session = await ensureCustomerSession();
        if (cancelled) return;

        setUserSession(session.publicId);
        setCustomerId(session.customerId);
        setCafeId(session.cafeId);
        setCafeName(session.cafeName);
        setCafesComprados(session.stampsCount);
        setStampsRequired(session.stampsRequired);
        setCardsCompleted(session.cardsCompleted ?? 0);
        prevStampsRef.current = session.stampsCount;

        if (session.stampsCount >= session.stampsRequired) {
          setShowComplete(true);
        }

        unsubCard = subscribeLoyaltyCard(
          { cafeId: session.cafeId, customerId: session.customerId },
          (card) => {
            const next = card.stamps_count;
            const required = session.stampsRequired;
            setCafesComprados(next);
            if (typeof card.cards_completed === "number") {
              setCardsCompleted(card.cards_completed);
            }
            if (
              next >= required &&
              prevStampsRef.current < required
            ) {
              setShowComplete(true);
            }
            prevStampsRef.current = next;
          },
        );
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("No se pudo cargar la sesión. Revisa Supabase.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubCard();
      if (unsubRequestRef.current) unsubRequestRef.current();
    };
  }, []);

  const handleNfcTap = async () => {
    if (!userSession || esperandoBarista) return;
    if (cafesComprados >= stampsRequired) {
      setShowComplete(true);
      return;
    }

    setEsperandoBarista(true);
    setError(null);

    try {
      const request = await createNfcRequest({
        cafeId,
        customerId,
        publicId: userSession,
      });

      if (request.mode === "local") return;

      if (unsubRequestRef.current) unsubRequestRef.current();
      unsubRequestRef.current = subscribeNfcRequest(request.id, (updated) => {
        if (updated.status === "aprobado") {
          setEsperandoBarista(false);
        }
        if (updated.status === "rechazado") {
          setEsperandoBarista(false);
        }
      });
    } catch (err) {
      console.error(err);
      setEsperandoBarista(false);
      setError("No se pudo enviar la petición NFC.");
    }
  };

  const handleStartNewCard = async () => {
    if (!userSession || startingNew) return;
    setStartingNew(true);
    setError(null);
    try {
      const result = await startNewCard(userSession);
      setCafesComprados(result.stamps_count ?? 0);
      if (typeof result.cards_completed === "number") {
        setCardsCompleted(result.cards_completed);
      }
      prevStampsRef.current = 0;
      setShowComplete(false);
    } catch (err) {
      console.error(err);
      setError(
        err.message?.includes("start_new_card")
          ? "Falta ejecutar supabase/card_complete_migration.sql en Supabase."
          : err.message || "No se pudo empezar el cartón nuevo.",
      );
    } finally {
      setStartingNew(false);
    }
  };

  const restantes = Math.max(0, stampsRequired - cafesComprados);
  const cartonCompleto = cafesComprados >= stampsRequired;

  return (
    <div className="min-h-dvh bg-stone-50 text-gray-900">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="rounded-full bg-[#178e3c]/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-[#178e3c]">
            Demo · {BRAND.productName}
          </span>
          <span
            className={[
              "rounded-full px-2.5 py-1 text-[10px] font-bold",
              isSupabaseConfigured
                ? "bg-[#178e3c]/10 text-[#178e3c]"
                : "bg-amber-50 text-amber-700",
            ].join(" ")}
          >
            {isSupabaseConfigured ? "Supabase ON" : "Modo local"}
          </span>
        </div>

        <header className="mb-8 text-center">
          <div className="mb-5 flex items-center justify-center gap-1.5">
            <h1 className="text-xl font-extrabold tracking-[0.18em] text-gray-900">
              {cafeName.toUpperCase()}
            </h1>
            <Smile
              className="size-5 text-[#178e3c]"
              strokeWidth={2.5}
              aria-hidden
            />
          </div>

          <h2 className="text-3xl font-bold leading-tight tracking-tight text-gray-900">
            Tu Tarjeta de Fidelidad
          </h2>
          <p className="mt-2 text-sm font-medium text-gray-500">
            {BRAND.productTagline}: 1 café gratis cada {stampsRequired} compras
          </p>
        </header>

        {error && (
          <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {error}
          </p>
        )}

        <section
          className={[
            "rounded-3xl bg-white p-6 shadow-sm transition",
            cartonCompleto ? "ring-2 ring-[#178e3c] ring-offset-2" : "",
          ].join(" ")}
          aria-label="Progreso de fidelidad"
        >
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">
              {loading ? "…" : `${cafesComprados} / ${stampsRequired} cafés`}
            </p>
            <span className="rounded-full bg-[#178e3c]/10 px-3 py-1 text-xs font-bold text-[#178e3c]">
              {cartonCompleto
                ? "¡Gratis listo!"
                : `${restantes} para gratis`}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: stampsRequired }).map((_, index) => {
              const comprado = index < cafesComprados;

              return (
                <div
                  key={index}
                  className={[
                    "flex aspect-square items-center justify-center rounded-full transition duration-500",
                    comprado
                      ? "scale-105 bg-[#178e3c] shadow-sm"
                      : "bg-gray-100",
                    cartonCompleto && comprado ? "animate-pulse" : "",
                  ].join(" ")}
                  aria-label={
                    comprado
                      ? `Café ${index + 1} registrado`
                      : `Espacio ${index + 1} vacío`
                  }
                >
                  <Coffee
                    className={
                      comprado ? "size-7 text-white" : "size-7 text-gray-300"
                    }
                    strokeWidth={2.5}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-stone-50 px-3 py-2.5 text-sm font-bold text-gray-700">
            <Trophy className="size-4 text-[#178e3c]" strokeWidth={2.5} />
            {cardsCompleted}{" "}
            {cardsCompleted === 1 ? "cartón completado" : "cartones completados"}
          </div>

          {cartonCompleto && (
            <button
              type="button"
              onClick={() => setShowComplete(true)}
              className="mt-3 w-full rounded-2xl bg-[#178e3c] py-3 text-sm font-bold text-white"
            >
              Canjear / empezar cartón nuevo
            </button>
          )}
        </section>

        <section className="mt-8 flex flex-col items-center">
          <div className="flex w-full flex-col items-center rounded-3xl bg-white p-5 shadow-sm">
            {userSession ? (
              <QRCodeSVG
                value={userSession}
                size={220}
                level="H"
                includeMargin
                bgColor="#ffffff"
                fgColor="#000000"
                title={`QR de ${userSession}`}
              />
            ) : (
              <div className="size-40 animate-pulse rounded-xl bg-stone-100" />
            )}
            <p className="mt-3 text-xs font-bold text-gray-400">
              Código escaneable · {userSession}
            </p>
          </div>

          <p className="mt-4 text-center text-sm font-medium text-gray-500">
            Muestra este código al barista en caja
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-gray-600 shadow-sm">
            <span className="size-1.5 rounded-full bg-[#178e3c]" aria-hidden />
            ID: {userSession ?? "…"}
          </div>

          <button
            type="button"
            onClick={handleNfcTap}
            disabled={loading || esperandoBarista}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-3xl bg-[#178e3c] py-4 text-base font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-[#136f2f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Nfc className="size-5" strokeWidth={2.5} aria-hidden />
            Tocar para pedir punto
          </button>

          {esperandoBarista && (
            <p
              className="mt-4 animate-pulse text-center text-sm font-semibold text-[#178e3c]"
              role="status"
            >
              Esperando confirmación del barista...
            </p>
          )}
        </section>

        <a
          href="#admin"
          className="mt-auto pt-8 text-center text-[10px] font-semibold tracking-wide text-stone-300"
        >
          Staff
        </a>
      </div>

      <CardCompleteModal
        open={showComplete}
        cardsCompleted={cardsCompleted}
        busy={startingNew}
        onStartNew={handleStartNewCard}
        onClose={() => setShowComplete(false)}
      />
    </div>
  );
}
