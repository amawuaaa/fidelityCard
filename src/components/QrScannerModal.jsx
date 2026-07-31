import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

/**
 * Modal de escáner QR con cámara.
 * onScan(decodedText) se llama una vez al leer un código.
 */
export default function QrScannerModal({ open, onClose, onScan }) {
  const [cameraError, setCameraError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [manualId, setManualId] = useState("");
  const [regionId, setRegionId] = useState(null);
  const scannerRef = useRef(null);
  const handledRef = useRef(false);
  const onScanRef = useRef(onScan);

  onScanRef.current = onScan;

  // Al abrir: genera un id fresco para el contenedor del video
  useEffect(() => {
    if (!open) {
      setRegionId(null);
      return;
    }
    setCameraError(null);
    setStarting(true);
    setManualId("");
    handledRef.current = false;
    setRegionId(`stamp-qr-reader-${Date.now()}`);
  }, [open]);

  // Cuando el contenedor ya existe en el DOM, arranca la cámara
  useEffect(() => {
    if (!open || !regionId) return undefined;

    let cancelled = false;
    let scanner = null;

    const startTimer = window.setTimeout(async () => {
      try {
        scanner = new Html5Qrcode(regionId);
        scannerRef.current = scanner;

        const cameras = await Html5Qrcode.getCameras();
        const backCam =
          cameras.find((c) => /back|rear|environment/i.test(c.label)) ||
          cameras[cameras.length - 1];

        const config = {
          fps: 12,
          qrbox: (viewW, viewH) => {
            const side = Math.min(viewW, viewH) * 0.72;
            return { width: side, height: side };
          },
          aspectRatio: 1.333,
        };

        const onSuccess = async (decodedText) => {
          if (handledRef.current || cancelled) return;
          handledRef.current = true;

          try {
            if (scanner?.isScanning) await scanner.stop();
          } catch {
            // ignore
          }

          onScanRef.current?.(String(decodedText).trim());
        };

        if (backCam?.id) {
          await scanner.start(backCam.id, config, onSuccess, () => {});
        } else {
          await scanner.start(
            { facingMode: "environment" },
            config,
            onSuccess,
            () => {},
          );
        }

        if (!cancelled) setStarting(false);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setStarting(false);
          setCameraError(
            "No se pudo abrir la cámara. Prueba en móvil con HTTPS, permite el permiso, o escribe el ID abajo.",
          );
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      const active = scannerRef.current;
      scannerRef.current = null;
      if (active) {
        const stop = active.isScanning
          ? active.stop().catch(() => {})
          : Promise.resolve();
        stop.finally(() => {
          try {
            active.clear();
          } catch {
            // ignore
          }
        });
      }
    };
  }, [open, regionId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h3 className="text-lg font-bold text-gray-900">Escanear QR</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-stone-100 p-2 text-gray-600 hover:bg-stone-200"
            aria-label="Cerrar"
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <p className="text-sm text-gray-500">
            Apunta la cámara al QR de la tarjeta del cliente (mejor desde otro
            teléfono).
          </p>

          {regionId ? (
            <div
              id={regionId}
              className="min-h-56 overflow-hidden rounded-2xl bg-stone-900 [&_video]:rounded-2xl"
            />
          ) : (
            <div className="flex min-h-56 items-center justify-center rounded-2xl bg-stone-900 text-sm text-white/60">
              Preparando cámara…
            </div>
          )}

          {starting && !cameraError && (
            <p className="text-center text-sm font-semibold text-gray-400">
              Abriendo cámara…
            </p>
          )}

          {cameraError && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              {cameraError}
            </p>
          )}

          <div className="border-t border-stone-100 pt-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
              O escribe el ID
            </p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!manualId.trim()) return;
                onScanRef.current?.(manualId.trim());
              }}
            >
              <input
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="usr_12345"
                className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#178e3c]"
              />
              <button
                type="submit"
                className="rounded-xl bg-[#178e3c] px-4 py-2 text-sm font-bold text-white"
              >
                Ir
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
