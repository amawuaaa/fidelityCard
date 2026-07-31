import { useEffect, useState } from "react";
import { Coffee, Nfc, QrCode, Smile } from "lucide-react";

const TOTAL_CAFES = 6;
const STORAGE_KEY = "episode_user_id";

export default function LoyaltyCard() {
  // ——— Persistencia de sesión en localStorage ———
  // Guarda el ID del cliente en React para usarlo en la UI (píldora, QR, NFC).
  const [userSession, setUserSession] = useState(null);

  // Contador de sellos del cartón (mock inicial: 4 cafés ya comprados).
  const [cafesComprados, setCafesComprados] = useState(4);

  // UI local: muestra el mensaje de espera tras tocar el botón NFC.
  const [esperandoBarista, setEsperandoBarista] = useState(false);

  useEffect(() => {
    // 1) Lee del navegador la clave "episode_user_id" (persistencia entre visitas).
    const storedUserId = localStorage.getItem(STORAGE_KEY);

    // 2) Si ya existía un ID, reutilízalo (mismo cliente / mismo dispositivo).
    if (storedUserId) {
      // 3) Sincroniza el estado de React con lo que había en localStorage.
      setUserSession(storedUserId);
      // 4) Sale temprano: no hace falta crear un usuario nuevo.
      return;
    }

    // 5) Si no hay ID, genera uno aleatorio con prefijo "usr_" (simula alta de usuario).
    const nuevoUserId = `usr_${Math.floor(10000 + Math.random() * 90000)}`;

    // 6) Guarda el ID nuevo en localStorage para la próxima visita.
    localStorage.setItem(STORAGE_KEY, nuevoUserId);

    // 7) Actualiza el estado de React para que la UI muestre el ID de inmediato.
    setUserSession(nuevoUserId);

    // 8) En el futuro: también crear el registro en Supabase (tabla profiles / loyalty_stamps).
  }, []);

  /**
   * handleNfcTap
   * Función preparada para el flujo NFC en barra.
   * Aquí se conectará la lógica de "Petición a la Base de Datos"
   * cuando el usuario acerque su teléfono a la pegatina NFC en la barra
   * (ej. POST a Supabase sumando +1 sello al userSession).
   */
  const handleNfcTap = () => {
    // TODO (Base de Datos):
    // await supabase.from('loyalty_stamps').upsert({ user_id: userSession, stamps_count: cafesComprados + 1 })
    // setCafesComprados((prev) => prev + 1)

    // Simulación local del proceso mientras el barista confirma.
    setEsperandoBarista(true);
  };

  return (
    <div className="min-h-dvh bg-stone-50 text-gray-900">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-6">
        {/* ——— Header ——— */}
        <header className="mb-8 text-center">
          <div className="mb-5 flex items-center justify-center gap-1.5">
            <h1 className="text-xl font-extrabold tracking-[0.18em] text-gray-900">
              EPISODE :)
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
            Pequeños placeres: 1 café gratis cada 6 compras
          </p>
        </header>

        {/* ——— Cartón digital (grid 2×3) ——— */}
        <section
          className="rounded-3xl bg-white p-6 shadow-sm"
          aria-label="Progreso de fidelidad"
        >
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">
              {cafesComprados} / {TOTAL_CAFES} cafés
            </p>
            <span className="rounded-full bg-[#178e3c]/10 px-3 py-1 text-xs font-bold text-[#178e3c]">
              {TOTAL_CAFES - cafesComprados} para gratis
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: TOTAL_CAFES }).map((_, index) => {
              const comprado = index < cafesComprados;

              return (
                <div
                  key={index}
                  className={[
                    "flex aspect-square items-center justify-center rounded-full",
                    comprado ? "bg-[#178e3c] shadow-sm" : "bg-gray-100",
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
        </section>

        {/* ——— Área de acción: QR / NFC ——— */}
        <section className="mt-8 flex flex-col items-center">
          <div className="flex size-44 items-center justify-center rounded-3xl bg-white p-6 shadow-sm">
            <QrCode
              className="size-28 text-gray-900"
              strokeWidth={1.75}
              aria-label="Código QR de fidelidad"
            />
          </div>

          <p className="mt-4 text-center text-sm font-medium text-gray-500">
            Muestra este código al barista en caja
          </p>

          {/* ID generado / leído desde localStorage */}
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-gray-600 shadow-sm">
            <span className="size-1.5 rounded-full bg-[#178e3c]" aria-hidden />
            ID: {userSession ?? "…"}
          </div>

          <button
            type="button"
            onClick={handleNfcTap}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-3xl bg-[#178e3c] py-4 text-base font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-[#136f2f]"
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
          className="mt-auto pt-8 text-center text-xs font-semibold text-gray-400 underline-offset-2 hover:text-[#178e3c] hover:underline"
        >
          Ir al Panel de Barista
        </a>
      </div>
    </div>
  );
}

/*
 * =============================================================================
 * CONFIGURACIÓN PWA (próximos pasos) — Añadir a pantalla de inicio
 * =============================================================================
 *
 * Para que el navegador del teléfono ofrezca “Añadir a pantalla de inicio”
 * y la web se sienta como una app nativa, hay que crear estos archivos
 * adicionales (aún no implementados en este proyecto):
 *
 * 1) public/manifest.json  (Web App Manifest)
 * 2) Enlace al manifest + metas apple-* desde index.html
 * 3) Service Worker (public/sw.js o vite-plugin-pwa)
 * 4) Iconos en public/icons/ (192 / 512 / maskable)
 * 5) HTTPS (o localhost) para que el navegador permita instalar
 *
 * Resumen: manifest.json + Service Worker + iconos + metas en index.html
 * = la web puede instalarse como app en la pantalla de inicio del móvil.
 * =============================================================================
 */
