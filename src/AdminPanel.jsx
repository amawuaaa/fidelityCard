import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, LogOut, Search, X } from "lucide-react";
import { BRAND } from "./config/brand.js";
import { applyBrandToDocument } from "./config/theme.js";
import { isSupabaseConfigured } from "./lib/supabase.js";
import {
  getAdminSession,
  logoutAdmin,
  onAdminAuthChange,
} from "./lib/adminAuth.js";
import {
  addStampByPublicId,
  approveNfcRequest,
  fetchCafeMetrics,
  fetchMyCafe,
  fetchPendingNfcRequests,
  fetchTodayApprovals,
  findCustomerByPublicId,
  rejectNfcRequest,
  removeStampByPublicId,
  startNewCard,
  subscribeLoyaltyCard,
  subscribePendingNfcRequests,
} from "./lib/loyaltyApi.js";
import { celebrateStamp } from "./lib/feedback.js";
import { useT } from "./i18n/LanguageContext.jsx";
import ManualSearchModal from "./components/ManualSearchModal.jsx";
import CustomerResultCard from "./components/CustomerResultCard.jsx";
import AdminLogin from "./components/AdminLogin.jsx";
import CafeMetrics from "./components/CafeMetrics.jsx";
import LanguageToggle from "./components/LanguageToggle.jsx";

// jsQR (~180 KB) solo se descarga al abrir el escáner por primera vez.
const QrScannerModal = lazy(() => import("./components/QrScannerModal.jsx"));

/**
 * Panel de Administrador (Barista) — Demo multi-cafetería
 * Protegido: login Supabase Auth (o PIN en modo local).
 */
export default function AdminPanel() {
  const t = useT();
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    let active = true;

    getAdminSession().then((s) => {
      if (active) {
        setSession(s);
        setAuthReady(true);
      }
    });

    const unsub = onAdminAuthChange((s) => {
      if (active) setSession(s);
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  if (!authReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-stone-100 text-sm font-semibold text-gray-400">
        {t("admin.checking")}
      </div>
    );
  }

  if (!session) {
    return (
      <AdminLogin
        onSuccess={async () => {
          const s = await getAdminSession();
          setSession(s);
        }}
      />
    );
  }

  return <AdminPanelInner onLogout={async () => {
    await logoutAdmin();
    setSession(null);
  }} />;
}

function AdminPanelInner({ onLogout }) {
  const t = useT();
  const [peticionesNfc, setPeticionesNfc] = useState([]);
  const [cafeId, setCafeId] = useState(null);
  const [cafeName, setCafeName] = useState(BRAND.cafeName);
  const [cafeSlug, setCafeSlug] = useState(BRAND.cafeSlug);
  const [staffRole, setStaffRole] = useState("barista");
  const [metrics, setMetrics] = useState(null);
  const [mensajeExito, setMensajeExito] = useState(null);
  const [historialHoy, setHistorialHoy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [addingStamp, setAddingStamp] = useState(false);
  const [startingNew, setStartingNew] = useState(false);

  const exitoTimerRef = useRef(null);

  const mostrarExito = useCallback((texto) => {
    setMensajeExito(texto);
    if (exitoTimerRef.current) window.clearTimeout(exitoTimerRef.current);
    exitoTimerRef.current = window.setTimeout(() => setMensajeExito(null), 2500);
  }, []);

  const cargarBandeja = useCallback(async () => {
    try {
      const mine = await fetchMyCafe();
      applyBrandToDocument(mine.brandColor, mine.themeStyle);
      setCafeId(mine.cafeId);
      setCafeName(mine.cafeName);
      setCafeSlug(mine.cafeSlug);
      setStaffRole(mine.role || "barista");

      const { requests } = await fetchPendingNfcRequests(mine.cafeSlug);
      setPeticionesNfc(requests);

      if (mine.cafeId) {
        const historial = await fetchTodayApprovals(mine.cafeId);
        setHistorialHoy(historial);
      }

      try {
        const m = await fetchCafeMetrics();
        setMetrics(m);
      } catch {
        setMetrics(null);
      }

      setError(null);
    } catch (err) {
      console.error(err);
      setError(t("admin.genericError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    cargarBandeja();
  }, [cargarBandeja]);

  useEffect(() => {
    if (!cafeId) return undefined;
    return subscribePendingNfcRequests(cafeId, () => {
      cargarBandeja();
    });
  }, [cafeId, cargarBandeja]);

  useEffect(() => {
    return () => {
      if (exitoTimerRef.current) window.clearTimeout(exitoTimerRef.current);
    };
  }, []);

  // Si el cliente empieza un cartón nuevo en su móvil, el admin lo ve al momento
  useEffect(() => {
    if (!clienteSeleccionado?.cafeId || !clienteSeleccionado?.customerId) {
      return undefined;
    }

    return subscribeLoyaltyCard(
      {
        cafeId: clienteSeleccionado.cafeId,
        customerId: clienteSeleccionado.customerId,
      },
      (card) => {
        setClienteSeleccionado((prev) =>
          prev
            ? {
                ...prev,
                stampsCount: card.stamps_count,
                cardsCompleted:
                  typeof card.cards_completed === "number"
                    ? card.cards_completed
                    : prev.cardsCompleted,
              }
            : prev,
        );
      },
    );
  }, [clienteSeleccionado?.cafeId, clienteSeleccionado?.customerId]);

  const refrescarCliente = useCallback(async (publicId) => {
    const customer = await findCustomerByPublicId(publicId);
    setClienteSeleccionado(customer);
    return customer;
  }, []);

  const cargarCliente = useCallback(
    async (rawId) => {
      setSearching(true);
      setError(null);
      try {
        const customer = await findCustomerByPublicId(rawId);
        setClienteSeleccionado(customer);
        setScannerOpen(false);
        setSearchOpen(false);
      } catch (err) {
        console.error(err);
        setError(t("admin.customerNotFound"));
        setSearchOpen(false);
      } finally {
        setSearching(false);
      }
    },
    [t],
  );

  const handleQrScan = useCallback(
    async (decodedText) => {
      setSearching(true);
      setError(null);
      try {
        const customer = await findCustomerByPublicId(decodedText);
        setClienteSeleccionado(customer);
        setScannerOpen(false);
        setSearchOpen(false);
      } catch (err) {
        console.error(err);
        setError(t("admin.customerNotFound"));
        throw err;
      } finally {
        setSearching(false);
      }
    },
    [t],
  );

  // Lo que ve el barista: el código corto de caja, nunca el usr_ interno
  const idVisible =
    clienteSeleccionado?.shortCode || clienteSeleccionado?.publicId;

  const handleRemoveStamp = async () => {
    if (!clienteSeleccionado || addingStamp) return;
    setAddingStamp(true);
    setError(null);
    try {
      const result = await removeStampByPublicId(clienteSeleccionado.publicId);
      setClienteSeleccionado((prev) =>
        prev
          ? {
              ...prev,
              stampsCount:
                typeof result.stamps_count === "number"
                  ? result.stamps_count
                  : Math.max(0, prev.stampsCount - 1),
              cardsCompleted:
                typeof result.cards_completed === "number"
                  ? result.cards_completed
                  : prev.cardsCompleted,
            }
          : prev,
      );
      mostrarExito(t("admin.toastRemoved", { id: idVisible }));
      if (isSupabaseConfigured) await cargarBandeja();
    } catch (err) {
      console.error(err);
      setError(t("admin.genericError"));
      try {
        await refrescarCliente(clienteSeleccionado.publicId);
      } catch {
        // ignore
      }
    } finally {
      setAddingStamp(false);
    }
  };

  const handleAddStamp = async () => {
    if (!clienteSeleccionado || addingStamp) return;
    setAddingStamp(true);
    setError(null);
    try {
      // Siempre leer estado fresco (por si el cliente ya empezó cartón nuevo)
      await refrescarCliente(clienteSeleccionado.publicId);

      const result = await addStampByPublicId(clienteSeleccionado.publicId);
      const nuevoCount =
        typeof result.stamps_count === "number"
          ? result.stamps_count
          : clienteSeleccionado.stampsCount + 1;
      const cards =
        typeof result.cards_completed === "number"
          ? result.cards_completed
          : clienteSeleccionado.cardsCompleted ?? 0;

      setClienteSeleccionado((prev) =>
        prev
          ? {
              ...prev,
              stampsCount: nuevoCount,
              cardsCompleted: cards,
            }
          : prev,
      );
      setHistorialHoy((prev) =>
        [clienteSeleccionado.publicId, ...prev].slice(0, 8),
      );

      // Confirmación audible: el barista no tiene que mirar la pantalla
      celebrateStamp();

      if (result.auto_started_new_card) {
        mostrarExito(t("admin.toastNewCardPlus", { id: idVisible }));
      } else if (
        result.card_completed ||
        nuevoCount >= clienteSeleccionado.stampsRequired
      ) {
        mostrarExito(t("admin.toastCardComplete", { id: idVisible }));
      } else {
        mostrarExito(t("admin.toastStampAdded", { id: idVisible }));
      }

      if (isSupabaseConfigured) await cargarBandeja();
    } catch (err) {
      console.error(err);
      const msg = err?.message || "";
      // Solo este caso es accionable por el barista; el resto es ruido técnico
      setError(
        /No autorizado|JWT|permission/i.test(msg)
          ? t("admin.sessionExpired")
          : t("admin.genericError"),
      );
      // Re-sincroniza UI con la BD
      try {
        await refrescarCliente(clienteSeleccionado.publicId);
      } catch {
        // ignore
      }
    } finally {
      setAddingStamp(false);
    }
  };

  const handleStartNewCard = async () => {
    if (!clienteSeleccionado || startingNew) return;
    setStartingNew(true);
    setError(null);
    try {
      const result = await startNewCard(clienteSeleccionado.publicId);
      setClienteSeleccionado((prev) =>
        prev
          ? {
              ...prev,
              stampsCount: result.stamps_count ?? 0,
              cardsCompleted:
                typeof result.cards_completed === "number"
                  ? result.cards_completed
                  : prev.cardsCompleted,
            }
          : prev,
      );
      mostrarExito(
        result.already_reset
          ? t("admin.toastAlreadyReset", { id: idVisible })
          : t("admin.toastNewCard", { id: idVisible }),
      );
    } catch (err) {
      console.error(err);
      setError(t("admin.genericError"));
      try {
        await refrescarCliente(clienteSeleccionado.publicId);
      } catch {
        // ignore
      }
    } finally {
      setStartingNew(false);
    }
  };

  /**
   * aprobarPunto(id)
   * Llama a la RPC approve_nfc_stamp en Supabase.
   */
  const aprobarPunto = async (id) => {
    const peticion = peticionesNfc.find((p) => p.id === id);
    if (!peticion || busyId) return;

    setBusyId(id);
    try {
      const result = await approveNfcRequest(id);
      const usuario = result?.public_id || peticion.usuario;

      celebrateStamp();
      setPeticionesNfc((prev) => prev.filter((p) => p.id !== id));
      setHistorialHoy((prev) => [usuario, ...prev].slice(0, 8));
      mostrarExito(t("admin.approvedFor", { id: usuario }));

      if (isSupabaseConfigured) await cargarBandeja();
    } catch (err) {
      console.error(err);
      setError(t("admin.approveFail"));
    } finally {
      setBusyId(null);
    }
  };

  const rechazarPunto = async (id) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await rejectNfcRequest(id);
      setPeticionesNfc((prev) => prev.filter((p) => p.id !== id));
      if (isSupabaseConfigured) await cargarBandeja();
    } catch (err) {
      console.error(err);
      setError(t("admin.rejectFail"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-dvh bg-stone-100 text-gray-900">
      <header className="flex items-center justify-between gap-3 bg-gray-900 px-5 py-4 text-white">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
            {BRAND.productName} · Barista
          </p>
          <h1 className="text-base font-bold tracking-wide sm:text-lg">
            {cafeName} — {t("admin.controlPanel")}
          </h1>
          <p className="text-[10px] font-semibold text-white/40">
            /{cafeSlug}
            {staffRole === "owner" ? " · owner" : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LanguageToggle />
          <div className="flex items-center gap-2 text-xs font-semibold text-brand sm:text-sm">
            <span
              className="size-2.5 animate-pulse rounded-full bg-brand shadow-[0_0_8px_color-mix(in_srgb,var(--brand)_80%,transparent)]"
              aria-hidden
            />
            {t("admin.online")}
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label={t("admin.logout")}
            title={t("admin.logout")}
          >
            <LogOut className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {mensajeExito && (
          <div
            className="mb-4 flex items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-sm"
            role="status"
          >
            <Check className="size-5 shrink-0" strokeWidth={2.5} />
            {mensajeExito}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {error}
          </div>
        )}

        <CafeMetrics metrics={metrics} role={staffRole} />

        <section className="mb-8 space-y-3">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setScannerOpen(true);
            }}
            className="flex w-full items-center justify-center gap-3 rounded-3xl bg-brand px-6 py-5 text-lg font-bold text-white shadow-sm transition active:scale-[0.99] hover:bg-brand-hover"
          >
            <Camera className="size-7" strokeWidth={2.5} aria-hidden />
            {t("admin.scanQr")}
          </button>

          <button
            type="button"
            onClick={() => {
              setError(null);
              setSearchOpen(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-3xl bg-white px-6 py-4 text-base font-bold text-gray-900 shadow-sm ring-1 ring-stone-200 transition active:scale-[0.99] hover:bg-stone-50"
          >
            <Search className="size-5" strokeWidth={2.5} aria-hidden />
            {t("admin.searchManual")}
          </button>
        </section>

        <CustomerResultCard
          customer={clienteSeleccionado}
          busy={addingStamp || startingNew}
          onAddStamp={handleAddStamp}
          onRemoveStamp={handleRemoveStamp}
          onStartNewCard={handleStartNewCard}
          onRefresh={() =>
            clienteSeleccionado &&
            refrescarCliente(clienteSeleccionado.publicId).catch((err) =>
              setError(err.message || t("admin.refreshFail")),
            )
          }
          onClose={() => setClienteSeleccionado(null)}
        />

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
              {t("admin.nfcTitle")}
            </h2>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-gray-600 shadow-sm">
              {loading
                ? "…"
                : t("admin.waitingCount", { n: peticionesNfc.length })}
            </span>
          </div>

          {loading ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
              <p className="text-sm font-semibold text-gray-400">
                {t("admin.loading")}
              </p>
            </div>
          ) : peticionesNfc.length === 0 ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
              <p className="text-base font-semibold text-gray-500">
                {t("admin.nfcEmpty")}
              </p>
              <p className="mt-1 text-sm text-gray-400">
                {t("admin.nfcEmptyHint")}
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {peticionesNfc.map((peticion) => (
                <li
                  key={peticion.id}
                  className="rounded-3xl bg-white p-5 shadow-sm sm:p-6"
                >
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                        {t("admin.customer")}
                      </p>
                      <p className="mt-0.5 text-xl font-extrabold text-gray-900">
                        {peticion.usuario}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                      {peticion.tiempo}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={busyId === peticion.id}
                      onClick={() => aprobarPunto(peticion.id)}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-sm font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-brand-hover disabled:opacity-60 sm:text-base"
                    >
                      <Check className="size-5" strokeWidth={2.5} aria-hidden />
                      {t("admin.approve")}
                    </button>

                    <button
                      type="button"
                      disabled={busyId === peticion.id}
                      onClick={() => rechazarPunto(peticion.id)}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-red-100 py-4 text-sm font-bold text-red-600 transition active:scale-[0.98] hover:bg-red-200 disabled:opacity-60 sm:text-base"
                    >
                      <X className="size-5" strokeWidth={2.5} aria-hidden />
                      {t("admin.reject")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-10 border-t border-stone-200 pt-5">
          <p className="text-sm text-gray-400">
            {t("admin.history")}{" "}
            {historialHoy.length > 0
              ? `${historialHoy.join(", ")}...`
              : t("admin.historyNone")}
          </p>

          <a
            href="#"
            className="mt-4 inline-block text-xs font-semibold text-gray-400 underline-offset-2 hover:text-brand hover:underline"
          >
            {t("admin.backToCard")}
          </a>
        </footer>
      </main>

      {scannerOpen && (
        <Suspense fallback={null}>
          <QrScannerModal
            open={scannerOpen}
            onClose={() => setScannerOpen(false)}
            onScan={handleQrScan}
          />
        </Suspense>
      )}

      <ManualSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSearch={cargarCliente}
        searching={searching}
      />
    </div>
  );
}
