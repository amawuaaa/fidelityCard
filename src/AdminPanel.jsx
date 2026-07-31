import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Search, X } from "lucide-react";
import { BRAND } from "./config/brand.js";
import { isSupabaseConfigured } from "./lib/supabase.js";
import {
  addStampByPublicId,
  approveNfcRequest,
  fetchPendingNfcRequests,
  fetchTodayApprovals,
  findCustomerByPublicId,
  rejectNfcRequest,
  subscribePendingNfcRequests,
} from "./lib/loyaltyApi.js";
import QrScannerModal from "./components/QrScannerModal.jsx";
import ManualSearchModal from "./components/ManualSearchModal.jsx";
import CustomerResultCard from "./components/CustomerResultCard.jsx";

/**
 * Panel de Administrador (Barista) — Demo multi-cafetería
 * Vista pensada para tablet/móvil: botones anchos y bandeja NFC en vivo.
 */
export default function AdminPanel() {
  const [peticionesNfc, setPeticionesNfc] = useState([]);
  const [cafeId, setCafeId] = useState(null);
  const [cafeName, setCafeName] = useState(BRAND.cafeName);
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

  const exitoTimerRef = useRef(null);

  const mostrarExito = useCallback((texto) => {
    setMensajeExito(texto);
    if (exitoTimerRef.current) window.clearTimeout(exitoTimerRef.current);
    exitoTimerRef.current = window.setTimeout(() => setMensajeExito(null), 2500);
  }, []);

  const cargarBandeja = useCallback(async () => {
    try {
      const { requests, cafeId: id, cafeName: name } =
        await fetchPendingNfcRequests();
      setPeticionesNfc(requests);
      setCafeId(id);
      setCafeName(name);

      if (id) {
        const historial = await fetchTodayApprovals(id);
        setHistorialHoy(historial);
      } else {
        setHistorialHoy(["usr_112", "usr_445"]);
      }
      setError(null);
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la bandeja NFC.");
    } finally {
      setLoading(false);
    }
  }, []);

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

  const cargarCliente = useCallback(async (rawId) => {
    setSearching(true);
    setError(null);
    try {
      const customer = await findCustomerByPublicId(rawId);
      setClienteSeleccionado(customer);
      setScannerOpen(false);
      setSearchOpen(false);
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo encontrar el cliente.");
      setScannerOpen(false);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQrScan = useCallback(
    (decodedText) => {
      cargarCliente(decodedText);
    },
    [cargarCliente],
  );

  const handleAddStamp = async () => {
    if (!clienteSeleccionado || addingStamp) return;
    setAddingStamp(true);
    setError(null);
    try {
      const result = await addStampByPublicId(clienteSeleccionado.publicId);
      const nuevoCount =
        typeof result.stamps_count === "number"
          ? result.stamps_count
          : (clienteSeleccionado.stampsCount + 1) %
            clienteSeleccionado.stampsRequired;

      setClienteSeleccionado((prev) =>
        prev
          ? {
              ...prev,
              stampsCount: nuevoCount,
            }
          : prev,
      );
      setHistorialHoy((prev) =>
        [clienteSeleccionado.publicId, ...prev].slice(0, 8),
      );
      mostrarExito(`Punto añadido a ${clienteSeleccionado.publicId}`);
      if (isSupabaseConfigured) await cargarBandeja();
    } catch (err) {
      console.error(err);
      const msg = err?.message || "";
      if (msg.includes("add_stamp_by_public_id") || msg.includes("function")) {
        setError(
          "Falta ejecutar supabase/add_stamp_rpc.sql en el SQL Editor de Supabase.",
        );
      } else {
        setError(msg || "No se pudo añadir el punto.");
      }
    } finally {
      setAddingStamp(false);
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

      setPeticionesNfc((prev) => prev.filter((p) => p.id !== id));
      setHistorialHoy((prev) => [usuario, ...prev].slice(0, 8));
      mostrarExito(`Punto aprobado para ${usuario}`);

      if (isSupabaseConfigured) await cargarBandeja();
    } catch (err) {
      console.error(err);
      setError("No se pudo aprobar el punto.");
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
      setError("No se pudo rechazar la petición.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-dvh bg-stone-100 text-gray-900">
      <header className="flex items-center justify-between gap-3 bg-gray-900 px-5 py-4 text-white">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
            {BRAND.productName} Demo · Barista
          </p>
          <h1 className="text-base font-bold tracking-wide sm:text-lg">
            {cafeName} — Panel de Control
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-xs font-semibold text-[#178e3c] sm:text-sm">
          <span
            className="size-2.5 animate-pulse rounded-full bg-[#178e3c] shadow-[0_0_8px_rgba(23,142,60,0.8)]"
            aria-hidden
          />
          {isSupabaseConfigured ? "Conectado a Supabase" : "Modo local"}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {mensajeExito && (
          <div
            className="mb-4 flex items-center gap-2 rounded-2xl bg-[#178e3c] px-4 py-3 text-sm font-bold text-white shadow-sm"
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

        <section className="mb-8 space-y-3">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setScannerOpen(true);
            }}
            className="flex w-full items-center justify-center gap-3 rounded-3xl bg-[#178e3c] px-6 py-5 text-lg font-bold text-white shadow-sm transition active:scale-[0.99] hover:bg-[#136f2f]"
          >
            <Camera className="size-7" strokeWidth={2.5} aria-hidden />
            Escanear QR de Cliente
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
            Buscar Cliente Manualmente
          </button>
        </section>

        <CustomerResultCard
          customer={clienteSeleccionado}
          busy={addingStamp}
          onAddStamp={handleAddStamp}
          onClose={() => setClienteSeleccionado(null)}
        />

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
              Peticiones NFC Pendientes
            </h2>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-gray-600 shadow-sm">
              {loading ? "…" : `${peticionesNfc.length} esperando`}
            </span>
          </div>

          {loading ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
              <p className="text-sm font-semibold text-gray-400">Cargando…</p>
            </div>
          ) : peticionesNfc.length === 0 ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
              <p className="text-base font-semibold text-gray-500">
                No hay peticiones pendientes
              </p>
              <p className="mt-1 text-sm text-gray-400">
                Las nuevas tocadas NFC aparecerán aquí en tiempo real
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
                        Cliente
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
                      className="flex items-center justify-center gap-2 rounded-2xl bg-[#178e3c] py-4 text-sm font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-[#136f2f] disabled:opacity-60 sm:text-base"
                    >
                      <Check className="size-5" strokeWidth={2.5} aria-hidden />
                      Aprobar Punto
                    </button>

                    <button
                      type="button"
                      disabled={busyId === peticion.id}
                      onClick={() => rechazarPunto(peticion.id)}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-red-100 py-4 text-sm font-bold text-red-600 transition active:scale-[0.98] hover:bg-red-200 disabled:opacity-60 sm:text-base"
                    >
                      <X className="size-5" strokeWidth={2.5} aria-hidden />
                      Rechazar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-10 border-t border-stone-200 pt-5">
          <p className="text-sm text-gray-400">
            Últimos puntos aprobados hoy:{" "}
            {historialHoy.length > 0
              ? `${historialHoy.join(", ")}...`
              : "ninguno todavía"}
          </p>

          <a
            href="#"
            className="mt-4 inline-block text-xs font-semibold text-gray-400 underline-offset-2 hover:text-[#178e3c] hover:underline"
          >
            ← Volver a la tarjeta de cliente
          </a>
        </footer>
      </main>

      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleQrScan}
      />

      <ManualSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSearch={cargarCliente}
        searching={searching}
      />
    </div>
  );
}
