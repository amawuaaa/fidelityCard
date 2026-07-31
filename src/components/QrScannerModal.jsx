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
  const scannerRef = useRef(null);
  const handledRef = useRef(false);
  const regionId = "stamp-qr-reader";

  useEffect(() => {
    if (!open) return undefined;

    handledRef.current = false;
    setCameraError(null);
    setStarting(true);

    let cancelled = false;
    const scanner = new Html5Qrcode(regionId);
    scannerRef.current = scanner;

    (async () => {
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            if (handledRef.current || cancelled) return;
            handledRef.current = true;
            onScan(decodedText);
          },
          () => {
            // ignorar frames sin QR
          },
        );
        if (!cancelled) setStarting(false);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setStarting(false);
          setCameraError(
            "No se pudo abrir la cámara. Usa HTTPS (o localhost), permite el permiso de cámara e inténtalo en un móvil/tablet.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      const active = scannerRef.current;
      scannerRef.current = null;
      if (active?.isScanning) {
        active
          .stop()
          .then(() => active.clear())
          .catch(() => {});
      }
    };
  }, [open, onScan]);

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
            Apunta la cámara al código QR de la tarjeta del cliente.
          </p>

          <div
            id={regionId}
            className="overflow-hidden rounded-2xl bg-stone-900 [&_video]:rounded-2xl"
          />

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
        </div>
      </div>
    </div>
  );
}
