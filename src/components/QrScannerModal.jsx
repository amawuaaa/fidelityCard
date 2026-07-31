import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

/**
 * Modal de escáner QR.
 * Prioriza BarcodeDetector nativo; si no está o falla, usa html5-qrcode
 * escaneando el frame completo (sin qrbox).
 */
export default function QrScannerModal({ open, onClose, onScan }) {
  const [cameraError, setCameraError] = useState(null);
  const [status, setStatus] = useState("Preparando cámara…");
  const [manualId, setManualId] = useState("");
  const [engine, setEngine] = useState(null); // 'native' | 'html5'
  const videoRef = useRef(null);
  const html5RegionRef = useRef(null);
  const handledRef = useRef(false);
  const onScanRef = useRef(onScan);
  const cleanupRef = useRef(() => {});

  onScanRef.current = onScan;

  useEffect(() => {
    if (!open) return undefined;

    handledRef.current = false;
    setCameraError(null);
    setManualId("");
    setStatus("Abriendo cámara…");
    setEngine(null);

    let cancelled = false;

    const finishWithText = async (raw, stopFn) => {
      if (handledRef.current || cancelled) return;
      handledRef.current = true;
      setStatus("¡Código detectado!");
      try {
        await stopFn?.();
      } catch {
        // ignore
      }
      onScanRef.current?.(String(raw).trim());
    };

    const startNativeDetector = async () => {
      if (!("BarcodeDetector" in window)) return false;

      let detector;
      try {
        detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      } catch {
        return false;
      }

      // Muestra el <video> antes de pedir stream
      setEngine("native");
      await new Promise((r) => requestAnimationFrame(() => r()));

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return true;
      }

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }

      video.srcObject = stream;
      await video.play();
      setStatus("Apunta al QR…");

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      let rafId = 0;
      let lastDetect = 0;

      const stop = () => {
        cancelAnimationFrame(rafId);
        stream.getTracks().forEach((t) => t.stop());
        if (video.srcObject) video.srcObject = null;
      };

      cleanupRef.current = stop;

      const tick = async () => {
        if (cancelled || handledRef.current) return;

        const now = performance.now();
        if (video.readyState >= 2 && ctx && now - lastDetect > 150) {
          lastDetect = now;
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (w && h) {
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            try {
              const codes = await detector.detect(canvas);
              if (codes?.length) {
                await finishWithText(codes[0].rawValue, stop);
                return;
              }
            } catch {
              // seguir
            }
          }
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
      return true;
    };

    const startHtml5Fallback = async () => {
      setEngine("html5");
      await new Promise((r) => requestAnimationFrame(() => r()));
      await new Promise((r) => setTimeout(r, 50));

      const regionEl = html5RegionRef.current;
      if (!regionEl) throw new Error("No hay contenedor para el escáner");

      const regionId = "stamp-html5-qr-fallback";
      regionEl.id = regionId;
      regionEl.innerHTML = "";

      const scanner = new Html5Qrcode(regionId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });

      const stop = async () => {
        try {
          if (scanner.isScanning) await scanner.stop();
          scanner.clear();
        } catch {
          // ignore
        }
      };

      cleanupRef.current = stop;

      const cameras = await Html5Qrcode.getCameras();
      const backCam =
        cameras.find((c) =>
          /back|rear|environment|trasera|atras/i.test(c.label),
        ) || cameras[cameras.length - 1];

      // Frame completo, sin qrbox
      const config = { fps: 15, disableFlip: false };

      if (backCam?.id) {
        await scanner.start(
          backCam.id,
          config,
          (text) => finishWithText(text, stop),
          () => {},
        );
      } else {
        await scanner.start(
          { facingMode: "environment" },
          config,
          (text) => finishWithText(text, stop),
          () => {},
        );
      }

      setStatus("Apunta al QR…");
    };

    (async () => {
      try {
        let ok = false;
        try {
          ok = await startNativeDetector();
        } catch (nativeErr) {
          console.warn("BarcodeDetector falló, usando fallback", nativeErr);
          cleanupRef.current?.();
          ok = false;
        }

        if (cancelled) return;

        if (!ok) {
          await startHtml5Fallback();
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setCameraError(
            "No se pudo usar la cámara. Escribe el ID abajo o prueba Chrome en Android.",
          );
          setStatus("");
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = () => {};
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
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

        <div className="space-y-3 overflow-y-auto p-4">
          <p className="text-sm text-gray-500">
            Acerca el QR de la tarjeta (otro teléfono). Evita reflejos y mantén
            el código dentro del recuadro.
          </p>

          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className={[
                "aspect-[3/4] w-full object-cover",
                engine === "native" ? "block" : "hidden",
              ].join(" ")}
            />

            <div
              ref={html5RegionRef}
              className={[
                "min-h-[360px] w-full [&_img]:hidden [&_video]:!relative [&_video]:!h-auto [&_video]:!w-full [&_video]:object-cover",
                engine === "html5" ? "block" : "hidden",
              ].join(" ")}
            />

            {!engine && (
              <div className="flex aspect-[3/4] items-center justify-center text-sm text-white/70">
                Preparando…
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="size-56 rounded-2xl border-2 border-white/90" />
            </div>
          </div>

          {status && !cameraError && (
            <p className="text-center text-sm font-semibold text-[#178e3c]">
              {status}
            </p>
          )}

          {cameraError && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              {cameraError}
            </p>
          )}

          <div className="border-t border-stone-100 pt-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
              Si no detecta, escribe el ID
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
