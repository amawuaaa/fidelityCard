/**
 * Feedback al caer un sello: sonido corto + vibración.
 *
 * Sin archivos de audio: se sintetizan dos notas con Web Audio (~250 ms).
 * Pesa 0 KB y no hay nada que precargar en la barra.
 */

let ctx = null;
let muted = false;

const MUTE_KEY = "cuptrack_muted";

try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  // Safari en modo privado
}

function getCtx() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) {
    try {
      ctx = new AudioCtx();
    } catch {
      return null;
    }
  }
  return ctx;
}

/**
 * Los navegadores bloquean el audio hasta que el usuario toca la pantalla.
 * El sello del cliente llega por polling (sin gesto), así que hay que
 * desbloquear el contexto en el primer toque o no sonará nunca.
 */
export function unlockAudio() {
  const audio = getCtx();
  if (audio?.state === "suspended") {
    audio.resume().catch(() => {});
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = Boolean(value);
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // ignore
  }
}

/** Dos notas ascendentes (A5 → E6). Corto y discreto para una barra. */
export function playStampSound() {
  if (muted) return;
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === "suspended") audio.resume().catch(() => {});

  const now = audio.currentTime;
  const master = audio.createGain();
  master.gain.value = 0.16;
  master.connect(audio.destination);

  const notes = [
    { freq: 880, at: 0 },
    { freq: 1318.5, at: 0.085 },
  ];

  for (const { freq, at } of notes) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.linearRampToValueAtTime(1, now + at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.22);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now + at);
    osc.stop(now + at + 0.25);
  }
}

/** iOS Safari no soporta vibración desde la web; en Android sí. */
export function vibrate(pattern = [12, 40, 18]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore
  }
}

/** El momento que vende el producto: sello nuevo en la tarjeta del cliente. */
export function celebrateStamp() {
  vibrate();
  playStampSound();
}
