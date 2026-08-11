import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, SwitchCamera, X } from "lucide-react";
import jsQR from "jsqr";
import { useT } from "../i18n/LanguageContext.jsx";

/**
 * Escáner QR casero con getUserMedia + jsQR.
 * Más fiable que wrappers de cámara en muchos móviles.
 * Incluye: cambiar cámara y subir/fotografiar el QR.
 */
export default function QrScannerModal({ open, onClose, onScan }) {
  const t = useT();
  const [status, setStatus] = useState("");
  const [cameraError, setCameraError] = useState(null);
  const [manualId, setManualId] = useState("");
  const [facingMode, setFacingMode] = useState("environment");
  const tRef = useRef(t);
  tRef.current = t;

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const handledRef = useRef(false);
  const onScanRef = useRef(onScan);
  const facingRef = useRef(facingMode);
  const fileRef = useRef(null);

  onScanRef.current = onScan;
  facingRef.current = facingMode;

  useEffect(() => {
    if (!open) return undefined;

    handledRef.current = false;
    setCameraError(null);
    setManualId("");
    setStatus(tRef.current("scan.opening"));

    let cancelled = false;

    const stopStream = () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const emit = async (text) => {
      if (handledRef.current || cancelled) return;
      handledRef.current = true;
      setStatus(tRef.current("scan.detected"));
      try {
        await onScanRef.current?.(String(text).trim());
        stopStream();
      } catch {
        // El padre no encontró cliente: seguimos escaneando
        if (!cancelled) {
          handledRef.current = false;
          setStatus(tRef.current("scan.retry"));
          rafRef.current = requestAnimationFrame(scanLoop);
        }
      }
    };

    const decodeCanvas = (canvas) => {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      const { width, height } = canvas;
      if (!width || !height) return null;

      const imageData = ctx.getImageData(0, 0, width, height);
      const code = jsQR(imageData.data, width, height, {
        inversionAttempts: "attemptBoth",
      });
      return code?.data || null;
    };

    const scanLoop = () => {
      if (cancelled || handledRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw && vh) {
          const maxW = 640;
          const scale = Math.min(1, maxW / vw);
          const w = Math.floor(vw * scale);
          const h = Math.floor(vh * scale);
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(video, 0, 0, w, h);

          let data = decodeCanvas(canvas);

          if (!data) {
            const crop = Math.floor(Math.min(w, h) * 0.7);
            const sx = Math.floor((w - crop) / 2);
            const sy = Math.floor((h - crop) / 2);
            const cropCanvas = document.createElement("canvas");
            cropCanvas.width = crop;
            cropCanvas.height = crop;
            const cctx = cropCanvas.getContext("2d", {
              willReadFrequently: true,
            });
            cctx.drawImage(canvas, sx, sy, crop, crop, 0, 0, crop, crop);
            data = decodeCanvas(cropCanvas);
          }

          if (data) {
            void emit(data);
            return;
          }
        }
      }

      rafRef.current = requestAnimationFrame(scanLoop);
    };

    const startCamera = async (facing) => {
      stopStream();
      setStatus(tRef.current("scan.opening"));
      setCameraError(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();
        setStatus(tRef.current("scan.searching"));
        rafRef.current = requestAnimationFrame(scanLoop);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setCameraError(tRef.current("scan.noCamera"));
          setStatus("");
        }
      }
    };

    startCamera(facingRef.current);

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, facingMode]);

  const decodeImageFile = async (file) => {
    if (!file) return;
    setStatus(t("scan.readingImage"));
    setCameraError(null);

    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const maxW = 1200;
      const scale = Math.min(1, maxW / bitmap.width);
      canvas.width = Math.floor(bitmap.width * scale);
      canvas.height = Math.floor(bitmap.height * scale);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height, {
        inversionAttempts: "attemptBoth",
      });

      if (!code?.data) {
        setCameraError(t("scan.noQrInPhoto"));
        setStatus(t("scan.searchingShort"));
        return;
      }

      handledRef.current = true;
      setStatus(t("scan.detectedShort"));
      try {
        await onScanRef.current?.(code.data.trim());
        streamRef.current?.getTracks().forEach((track) => track.stop());
      } catch {
        handledRef.current = false;
        setStatus(t("scan.retryPhoto"));
      }
    } catch (err) {
      console.error(err);
      setCameraError(t("scan.imageError"));
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4">
      <div className="flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
          <h3 className="text-lg font-bold text-gray-900">{t("scan.title")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-stone-100 p-2 text-gray-600 hover:bg-stone-200"
            aria-label={t("scan.close")}
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-4">
          <p className="text-sm text-gray-500">{t("scan.hint")}</p>

          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className="aspect-[3/4] w-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="size-56 rounded-2xl border-2 border-white/90" />
            </div>
          </div>

          {status && (
            <p className="text-center text-sm font-semibold text-brand">
              {status}
            </p>
          )}

          {cameraError && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              {cameraError}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                setFacingMode((f) =>
                  f === "environment" ? "user" : "environment",
                )
              }
              className="flex items-center justify-center gap-2 rounded-2xl bg-stone-100 py-3 text-sm font-bold text-gray-800"
            >
              <SwitchCamera className="size-4" strokeWidth={2.5} />
              {t("scan.switchCam")}
            </button>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-bold text-white"
            >
              <ImagePlus className="size-4" strokeWidth={2.5} />
              {t("scan.photo")}
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => decodeImageFile(e.target.files?.[0])}
          />

          <div className="border-t border-stone-100 pt-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">
              <Camera className="size-3.5" />
              {t("scan.manual")}
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
                placeholder={t("scan.placeholder")}
                className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-brand"
              />
              <button
                type="submit"
                className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white"
              >
                {t("scan.go")}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
