import { useEffect, useRef, useState } from "react";
import { Camera, Check, Search, X } from "lucide-react";

/**
 * Episode — Panel de Administrador (Barista)
 * Vista pensada para tablet/móvil: botones anchos y bandeja NFC en vivo.
 */
export default function AdminPanel() {
  // Bandeja en vivo: peticiones NFC pendientes de aprobación.
  // En producción esto vendría de Supabase Realtime (channel on 'nfc_requests').
  const [peticionesNfc, setPeticionesNfc] = useState([
    { id: 1, usuario: "usr_883", estado: "esperando", tiempo: "Hace 10 seg" },
    { id: 2, usuario: "usr_991", estado: "esperando", tiempo: "Hace 2 min" },
  ]);

  // Mensaje breve de éxito tras aprobar un punto.
  const [mensajeExito, setMensajeExito] = useState(null);

  // IDs mostrados en el historial visual (últimos aprobados hoy).
  const [historialHoy, setHistorialHoy] = useState(["usr_112", "usr_445"]);

  // Timer para ocultar el toast de éxito sin acumular timeouts.
  const exitoTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (exitoTimerRef.current) window.clearTimeout(exitoTimerRef.current);
    };
  }, []);

  /**
   * aprobarPunto(id)
   * Simula que el barista confirma el sello NFC del cliente.
   *
   * Conexión futura a Supabase (paso a paso):
   * 1) Localizar la petición en el array (o en la tabla `nfc_requests`) por `id`.
   * 2) Obtener el `usuario` (ej. "usr_883") de esa petición.
   * 3) Actualizar la fila del cliente en la base de datos, sumando +1 sello:
   *    await supabase
   *      .from('loyalty_stamps')
   *      .update({ stamps_count: stamps_count + 1 })
   *      .eq('user_id', peticion.usuario)
   *    // Alternativa atómica recomendada:
   *    // await supabase.rpc('add_loyalty_stamp', { p_user_id: peticion.usuario })
   * 4) Marcar la petición NFC como resuelta (o borrarla):
   *    await supabase.from('nfc_requests').delete().eq('id', id)
   *    // o .update({ estado: 'aprobado' }).eq('id', id)
   * 5) La UI del cliente (escuchando Realtime) actualizaría `cafesComprados` sola.
   * 6) Aquí, en el panel, quitamos la tarjeta de la bandeja local.
   */
  const aprobarPunto = (id) => {
    // Busca la petición para conocer el usuario aprobado (historial + mensaje).
    const peticion = peticionesNfc.find((p) => p.id === id);
    if (!peticion) return;

    // Elimina la petición del array → simula que quedó resuelta.
    setPeticionesNfc((prev) => prev.filter((p) => p.id !== id));

    // Añade el usuario al historial visual de hoy.
    setHistorialHoy((prev) => [peticion.usuario, ...prev].slice(0, 6));

    // Muestra un mensaje de éxito corto y lo limpia a los 2.5s.
    setMensajeExito(`Punto aprobado para ${peticion.usuario}`);
    if (exitoTimerRef.current) window.clearTimeout(exitoTimerRef.current);
    exitoTimerRef.current = window.setTimeout(() => setMensajeExito(null), 2500);
  };

  /**
   * rechazarPunto(id)
   * Solo elimina la petición de la lista (sin sumar sello).
   * Futuro Supabase: delete/update estado='rechazado' en `nfc_requests`.
   */
  const rechazarPunto = (id) => {
    setPeticionesNfc((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="min-h-dvh bg-stone-100 text-gray-900">
      {/* ——— 1. Top Bar de Control ——— */}
      <header className="flex items-center justify-between gap-3 bg-gray-900 px-5 py-4 text-white">
        <h1 className="text-base font-bold tracking-wide sm:text-lg">
          EPISODE - Panel de Control
        </h1>

        <div className="flex shrink-0 items-center gap-2 text-xs font-semibold text-[#178e3c] sm:text-sm">
          <span
            className="size-2.5 animate-pulse rounded-full bg-[#178e3c] shadow-[0_0_8px_rgba(23,142,60,0.8)]"
            aria-hidden
          />
          Conectado al servidor
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {/* Toast de éxito */}
        {mensajeExito && (
          <div
            className="mb-4 flex items-center gap-2 rounded-2xl bg-[#178e3c] px-4 py-3 text-sm font-bold text-white shadow-sm"
            role="status"
          >
            <Check className="size-5 shrink-0" strokeWidth={2.5} />
            {mensajeExito}
          </div>
        )}

        {/* ——— 2. Botones de Acción Rápida ——— */}
        <section className="mb-8 space-y-3">
          <button
            type="button"
            onClick={() => alert("Abriendo cámara...")}
            className="flex w-full items-center justify-center gap-3 rounded-3xl bg-[#178e3c] px-6 py-5 text-lg font-bold text-white shadow-sm transition active:scale-[0.99] hover:bg-[#136f2f]"
          >
            <Camera className="size-7" strokeWidth={2.5} aria-hidden />
            Escanear QR de Cliente
          </button>

          <button
            type="button"
            onClick={() => alert("Buscar cliente por ID...")}
            className="flex w-full items-center justify-center gap-2 rounded-3xl bg-white px-6 py-4 text-base font-bold text-gray-900 shadow-sm ring-1 ring-stone-200 transition active:scale-[0.99] hover:bg-stone-50"
          >
            <Search className="size-5" strokeWidth={2.5} aria-hidden />
            Buscar Cliente Manualmente
          </button>
        </section>

        {/* ——— 3. Bandeja de Entrada en Vivo ——— */}
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
              Peticiones NFC Pendientes
            </h2>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-gray-600 shadow-sm">
              {peticionesNfc.length} esperando
            </span>
          </div>

          {peticionesNfc.length === 0 ? (
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
                      onClick={() => aprobarPunto(peticion.id)}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-[#178e3c] py-4 text-sm font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-[#136f2f] sm:text-base"
                    >
                      <Check className="size-5" strokeWidth={2.5} aria-hidden />
                      Aprobar Punto
                    </button>

                    <button
                      type="button"
                      onClick={() => rechazarPunto(peticion.id)}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-red-100 py-4 text-sm font-bold text-red-600 transition active:scale-[0.98] hover:bg-red-200 sm:text-base"
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

        {/* ——— 4. Historial Reciente ——— */}
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
    </div>
  );
}
