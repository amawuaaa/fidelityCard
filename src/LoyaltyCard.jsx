import { useEffect, useRef, useState } from "react";
import { Coffee, Nfc, Trophy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { BRAND } from "./config/brand.js";
import {
  buildCustomerQrValue,
  getActiveCafeSlug,
} from "./config/cafeContext.js";
import {
  applyBrandToDocument,
  stampFillStyle,
} from "./config/theme.js";
import {
  createNfcRequest,
  ensureCustomerSession,
  startNewCard,
  subscribeLoyaltyCard,
  subscribeNfcRequest,
} from "./lib/loyaltyApi.js";
import CardCompleteModal from "./components/CardCompleteModal.jsx";
import CupLogo from "./components/CupLogo.jsx";
import DemoCafeSwitcher from "./components/DemoCafeSwitcher.jsx";

export default function LoyaltyCard() {
  const [userSession, setUserSession] = useState(null);
  const [customerId, setCustomerId] = useState(null);
  const [cafeId, setCafeId] = useState(null);
  const [cafeSlug, setCafeSlug] = useState(getActiveCafeSlug());
  const [cafeName, setCafeName] = useState(BRAND.cafeName);
  const [tagline, setTagline] = useState(BRAND.tagline);
  const [rewardLabel, setRewardLabel] = useState(BRAND.rewardLabel);
  const [themeStyle, setThemeStyle] = useState("solid");
  const [cafesComprados, setCafesComprados] = useState(0);
  const [stampsRequired, setStampsRequired] = useState(BRAND.stampsRequired);
  const [cardsCompleted, setCardsCompleted] = useState(0);
  const [esperandoBarista, setEsperandoBarista] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showComplete, setShowComplete] = useState(false);
  const [startingNew, setStartingNew] = useState(false);
  const [qrValue, setQrValue] = useState("");
  const unsubRequestRef = useRef(null);
  const prevStampsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let unsubCard = () => {};
    const slug = getActiveCafeSlug();

    (async () => {
      try {
        const session = await ensureCustomerSession(slug);
        if (cancelled) return;

        applyBrandToDocument(session.brandColor, session.themeStyle);
        setUserSession(session.publicId);
        setCustomerId(session.customerId);
        setCafeId(session.cafeId);
        setCafeSlug(session.cafeSlug || slug);
        setCafeName(session.cafeName);
        setTagline(session.tagline || BRAND.tagline);
        setRewardLabel(session.rewardLabel || BRAND.rewardLabel);
        setThemeStyle(session.themeStyle || "solid");
        setCafesComprados(session.stampsCount);
        setStampsRequired(session.stampsRequired);
        setCardsCompleted(session.cardsCompleted ?? 0);
        setQrValue(
          buildCustomerQrValue(session.publicId, session.cafeSlug || slug),
        );
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
            if (next >= required && prevStampsRef.current < required) {
              setShowComplete(true);
            }
            prevStampsRef.current = next;
          },
        );
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("No se pudo cargar tu tarjeta. Inténtalo de nuevo.");
        }
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
        if (updated.status === "aprobado" || updated.status === "rechazado") {
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
      const result = await startNewCard(userSession, cafeSlug);
      setCafesComprados(result.stamps_count ?? 0);
      if (typeof result.cards_completed === "number") {
        setCardsCompleted(result.cards_completed);
      }
      prevStampsRef.current = 0;
      setShowComplete(false);
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo empezar el cartón nuevo.");
    } finally {
      setStartingNew(false);
    }
  };

  const restantes = Math.max(0, stampsRequired - cafesComprados);
  const cartonCompleto = cafesComprados >= stampsRequired;

  const isLayers = cafeSlug === "layers" || themeStyle === "rainbow";
  const isBakery = cafeSlug === "etma" || themeStyle === "bakery";

  return (
    <div className="min-h-dvh bg-[var(--page-bg)] text-gray-900">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-6">
        <div className="mb-4 flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-brand">
            <CupLogo className="size-3.5" decorative />
            {BRAND.productName}
          </span>
        </div>

        <header className="mb-8 text-center">
          <div className="mb-5 flex items-center justify-center gap-1.5">
            <h1
              className={[
                "font-extrabold text-gray-900",
                isLayers
                  ? "text-2xl tracking-[0.14em]"
                  : "text-xl tracking-[0.18em]",
              ].join(" ")}
            >
              {isLayers ? (
                <>
                  <span className="mr-1.5 text-sm font-bold tracking-normal text-stone-400">
                    the
                  </span>
                  LAYERS
                </>
              ) : (
                cafeName.toUpperCase()
              )}
            </h1>
            <CupLogo className="size-6 text-brand" title={cafeName} />
          </div>

          <h2 className="text-3xl font-bold leading-tight tracking-tight text-gray-900">
            Tu Tarjeta de Fidelidad
          </h2>
          <p className="mt-2 text-sm font-medium text-gray-500">
            {tagline}: {rewardLabel} cada {stampsRequired} compras
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
            cartonCompleto ? "ring-2 ring-brand ring-offset-2" : "",
          ].join(" ")}
          aria-label="Progreso de fidelidad"
        >
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">
              {loading ? "…" : `${cafesComprados} / ${stampsRequired} cafés`}
            </p>
            <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
              {cartonCompleto ? "¡Gratis listo!" : `${restantes} para gratis`}
            </span>
          </div>

          <div
            className={[
              "grid gap-4",
              stampsRequired > 6 ? "grid-cols-4" : "grid-cols-3",
            ].join(" ")}
          >
            {Array.from({ length: stampsRequired }).map((_, index) => {
              const comprado = index < cafesComprados;
              const rainbowFill = comprado
                ? stampFillStyle(themeStyle, index)
                : undefined;

              return (
                <div
                  key={index}
                  className={[
                    "flex aspect-square items-center justify-center rounded-full transition duration-500",
                    comprado && !rainbowFill
                      ? "scale-105 bg-brand shadow-sm"
                      : "",
                    comprado && rainbowFill ? "scale-105 shadow-sm" : "",
                    !comprado
                      ? isBakery
                        ? "bg-[#E8E0D4]"
                        : "bg-gray-100"
                      : "",
                    cartonCompleto && comprado ? "animate-pulse" : "",
                  ].join(" ")}
                  style={rainbowFill}
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
            <Trophy className="size-4 text-brand" strokeWidth={2.5} />
            {cardsCompleted}{" "}
            {cardsCompleted === 1 ? "cartón completado" : "cartones completados"}
          </div>

          {cartonCompleto && (
            <button
              type="button"
              onClick={() => setShowComplete(true)}
              className="mt-3 w-full rounded-2xl bg-brand py-3 text-sm font-bold text-white hover:bg-brand-hover"
            >
              Canjear / empezar cartón nuevo
            </button>
          )}
        </section>

        <section className="mt-8 flex flex-col items-center">
          <div className="flex w-full flex-col items-center rounded-3xl bg-white p-5 shadow-sm">
            {qrValue ? (
              <QRCodeSVG
                value={qrValue}
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
              {userSession} · {cafeSlug}
            </p>
          </div>

          <p className="mt-4 text-center text-sm font-medium text-gray-500">
            Muestra este código al barista en caja
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-gray-600 shadow-sm">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden />
            ID: {userSession ?? "…"}
          </div>

          <button
            type="button"
            onClick={handleNfcTap}
            disabled={loading || esperandoBarista}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-3xl bg-brand py-4 text-base font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Nfc className="size-5" strokeWidth={2.5} aria-hidden />
            Tocar para pedir punto
          </button>

          {esperandoBarista && (
            <p
              className="mt-4 animate-pulse text-center text-sm font-semibold text-brand"
              role="status"
            >
              Esperando confirmación del barista...
            </p>
          )}
        </section>

        {BRAND.isDemo && <DemoCafeSwitcher activeSlug={cafeSlug} />}

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
        rewardLabel={rewardLabel}
        busy={startingNew}
        onStartNew={handleStartNewCard}
        onClose={() => setShowComplete(false)}
      />
    </div>
  );
}
