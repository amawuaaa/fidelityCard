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
  localizeCafeCopy,
  stampFillStyle,
} from "./config/theme.js";
import {
  cancelNfcRequest,
  createNfcRequest,
  ensureCustomerSession,
  pollLoyaltyCard,
  pollNfcRequest,
  startNewCard,
} from "./lib/loyaltyApi.js";
import { useLang, useT } from "./i18n/LanguageContext.jsx";
import CardCompleteModal from "./components/CardCompleteModal.jsx";
import CupLogo from "./components/CupLogo.jsx";
import DemoCafeSwitcher from "./components/DemoCafeSwitcher.jsx";
import InstallHint from "./components/InstallHint.jsx";
import LanguageToggle from "./components/LanguageToggle.jsx";
import RainbowWordmark from "./components/RainbowWordmark.jsx";

const NFC_TIMEOUT_MS = 90_000;

export default function LoyaltyCard() {
  const t = useT();
  const { lang } = useLang();
  const [userSession, setUserSession] = useState(null);
  const [shortCode, setShortCode] = useState(null);
  const [cafeSlug, setCafeSlug] = useState(getActiveCafeSlug());
  const [cafeName, setCafeName] = useState(BRAND.cafeName);
  const [taglineRaw, setTaglineRaw] = useState(BRAND.tagline);
  const [rewardLabelRaw, setRewardLabelRaw] = useState(BRAND.rewardLabel);
  const [themeStyle, setThemeStyle] = useState("solid");
  const [cafesComprados, setCafesComprados] = useState(0);
  const [stampsRequired, setStampsRequired] = useState(BRAND.stampsRequired);
  const [cardsCompleted, setCardsCompleted] = useState(0);
  const [esperandoBarista, setEsperandoBarista] = useState(false);
  const [cancellingNfc, setCancellingNfc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showComplete, setShowComplete] = useState(false);
  const [startingNew, setStartingNew] = useState(false);
  const [qrValue, setQrValue] = useState("");
  const stopPollRequestRef = useRef(null);
  const nfcTimeoutRef = useRef(null);
  const pendingRequestIdRef = useRef(null);
  const prevStampsRef = useRef(0);

  const clearNfcWait = () => {
    if (nfcTimeoutRef.current) {
      window.clearTimeout(nfcTimeoutRef.current);
      nfcTimeoutRef.current = null;
    }
    if (stopPollRequestRef.current) {
      stopPollRequestRef.current();
      stopPollRequestRef.current = null;
    }
    pendingRequestIdRef.current = null;
    setEsperandoBarista(false);
  };

  useEffect(() => {
    let cancelled = false;
    let stopCardPoll = () => {};
    const slug = getActiveCafeSlug();

    (async () => {
      try {
        const session = await ensureCustomerSession(slug);
        if (cancelled) return;

        applyBrandToDocument(session.brandColor, session.themeStyle);
        setUserSession(session.publicId);
        setShortCode(session.shortCode || null);
        setCafeSlug(session.cafeSlug || slug);
        setCafeName(session.cafeName);
        setTaglineRaw(session.tagline || BRAND.tagline);
        setRewardLabelRaw(session.rewardLabel || BRAND.rewardLabel);
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

        const required = session.stampsRequired;
        stopCardPoll = pollLoyaltyCard(
          {
            cafeSlug: session.cafeSlug || slug,
            publicId: session.publicId,
          },
          (card) => {
            const next = card.stampsCount;
            setCafesComprados(next);
            if (card.shortCode) setShortCode(card.shortCode);
            if (typeof card.cardsCompleted === "number") {
              setCardsCompleted(card.cardsCompleted);
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
          const msg = err?.message || "";
          setError(
            /no encontrado|Café no encontrado/i.test(msg)
              ? t("card.cafeMissing", { slug })
              : msg || t("card.loadError"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      stopCardPoll();
      if (stopPollRequestRef.current) stopPollRequestRef.current();
      if (nfcTimeoutRef.current) window.clearTimeout(nfcTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sesión una vez al montar
  }, []);

  const handleCancelNfc = async ({
    timedOut = false,
    requestId = pendingRequestIdRef.current,
    publicId = userSession,
  } = {}) => {
    if (cancellingNfc) return;
    setCancellingNfc(true);
    try {
      if (requestId && publicId) {
        await cancelNfcRequest({ requestId, publicId });
      }
    } catch (err) {
      console.error(err);
    } finally {
      clearNfcWait();
      setCancellingNfc(false);
      if (timedOut) {
        setError(t("card.nfcTimeout"));
      }
    }
  };

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
        cafeSlug,
        publicId: userSession,
      });

      pendingRequestIdRef.current = request.id;

      const armTimeout = () => {
        if (nfcTimeoutRef.current) window.clearTimeout(nfcTimeoutRef.current);
        nfcTimeoutRef.current = window.setTimeout(() => {
          handleCancelNfc({
            timedOut: true,
            requestId: request.id,
            publicId: userSession,
          });
        }, NFC_TIMEOUT_MS);
      };

      if (request.mode === "local") {
        armTimeout();
        return;
      }

      if (stopPollRequestRef.current) stopPollRequestRef.current();
      stopPollRequestRef.current = pollNfcRequest(
        request.id,
        userSession,
        (updated) => {
          if (updated.status === "aprobado" || updated.status === "rechazado") {
            clearNfcWait();
          }
        },
      );

      armTimeout();
    } catch (err) {
      console.error(err);
      clearNfcWait();
      setError(t("card.nfcSendError"));
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
      setError(err.message || t("card.newCardError"));
    } finally {
      setStartingNew(false);
    }
  };

  const restantes = Math.max(0, stampsRequired - cafesComprados);
  const cartonCompleto = cafesComprados >= stampsRequired;
  const { tagline, rewardLabel } = localizeCafeCopy(
    cafeSlug,
    taglineRaw,
    rewardLabelRaw,
    lang,
  );

  const isRainbow = themeStyle === "rainbow";
  const isBakery = themeStyle === "bakery";

  return (
    <div className="min-h-dvh bg-[var(--page-bg)] text-gray-900">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-brand">
            <CupLogo className="size-3.5" decorative />
            {BRAND.productName}
          </span>
          <LanguageToggle />
        </div>

        <header className="mb-8 text-center">
          <div className="mb-5 flex items-center justify-center gap-1.5">
            {isRainbow ? (
              <h1 className="text-2xl">
                <RainbowWordmark text="PRISM" />
              </h1>
            ) : (
              <h1 className="text-xl font-extrabold tracking-[0.18em] text-gray-900">
                {cafeName.toUpperCase()}
              </h1>
            )}
            <CupLogo className="size-6 text-brand" title={cafeName} />
          </div>

          <h2 className="text-3xl font-bold leading-tight tracking-tight text-gray-900">
            {t("card.title")}
          </h2>
          <p className="mt-2 text-sm font-medium text-gray-500">
            {t("card.subtitle", {
              tagline,
              reward: rewardLabel,
              n: stampsRequired,
            })}
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
          aria-label={t("card.progressAria")}
        >
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">
              {loading
                ? "…"
                : t("card.progress", {
                    current: cafesComprados,
                    required: stampsRequired,
                  })}
            </p>
            <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
              {cartonCompleto
                ? t("card.ready")
                : t("card.left", { n: restantes })}
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
            {cardsCompleted === 1 ? t("card.cardsOne") : t("card.cardsMany")}
          </div>

          {shortCode && (
            <div className="mt-3 rounded-2xl bg-brand-soft px-3 py-3 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand">
                {t("card.codeLabel")}
              </p>
              <p className="mt-0.5 text-3xl font-extrabold tracking-[0.2em] text-gray-900">
                {shortCode}
              </p>
              <p className="mt-1 text-xs font-medium text-gray-500">
                {t("card.codeHint")}
              </p>
            </div>
          )}

          {cartonCompleto && (
            <button
              type="button"
              onClick={() => setShowComplete(true)}
              className="mt-3 w-full rounded-2xl bg-brand py-3 text-sm font-bold text-white hover:bg-brand-hover"
            >
              {t("card.redeem")}
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
                title={`QR ${userSession}`}
              />
            ) : (
              <div className="size-40 animate-pulse rounded-xl bg-stone-100" />
            )}
            <p className="mt-3 text-xs font-bold text-gray-400">
              {userSession} · {cafeSlug}
            </p>
          </div>

          <p className="mt-4 text-center text-sm font-medium text-gray-500">
            {t("card.showQr")}
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
            {t("card.askStamp")}
          </button>

          {esperandoBarista && (
            <div className="mt-4 w-full space-y-3" role="status">
              <p className="animate-pulse text-center text-sm font-semibold text-brand">
                {t("card.waiting")}
              </p>
              <p className="text-center text-xs font-medium text-gray-400">
                {t("card.timeoutHint")}
              </p>
              <button
                type="button"
                onClick={() => handleCancelNfc()}
                disabled={cancellingNfc}
                className="w-full rounded-2xl bg-stone-100 py-3 text-sm font-bold text-gray-700 hover:bg-stone-200 disabled:opacity-60"
              >
                {cancellingNfc ? t("card.cancelling") : t("card.cancel")}
              </button>
            </div>
          )}

          <InstallHint />
        </section>

        {BRAND.isDemo && <DemoCafeSwitcher activeSlug={cafeSlug} />}

        {BRAND.isDemo && (
          <a
            href="#admin"
            className="mt-auto pt-8 text-center text-[10px] font-semibold tracking-wide text-stone-300"
          >
            Staff
          </a>
        )}
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
