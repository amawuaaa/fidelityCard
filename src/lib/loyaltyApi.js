import { BRAND } from "../config/brand.js";
import { getActiveCafeSlug, setActiveCafeSlug } from "../config/cafeContext.js";
import { getDemoCafe, resolveThemeStyle } from "../config/theme.js";
import { isSupabaseConfigured, supabase } from "./supabase.js";

const CLAIM_STORAGE_KEY = `${BRAND.storageKey}_claim`;

/**
 * ID interno: usr_ + 7 dígitos. En caja se usa short_code (4 dígitos por café).
 */
function generatePublicId() {
  const bytes = new Uint8Array(7);
  crypto.getRandomValues(bytes);
  const digits = Array.from(bytes, (b) => (b % 10).toString()).join("");
  return `usr_${digits}`;
}

function isValidPublicId(publicId) {
  return typeof publicId === "string" && /^usr_[0-9]{5,12}$/.test(publicId);
}

function getOrCreateLocalPublicId({ forceNew = false } = {}) {
  let publicId = forceNew ? null : localStorage.getItem(BRAND.storageKey);
  // Si quedó un ID con letras (deploy hex) o inválido → regenerar
  if (!isValidPublicId(publicId)) {
    publicId = generatePublicId();
    localStorage.setItem(BRAND.storageKey, publicId);
    localStorage.removeItem(CLAIM_STORAGE_KEY);
  }
  return publicId;
}

function storeClaimToken(token) {
  if (token) localStorage.setItem(CLAIM_STORAGE_KEY, token);
}

export function getStoredClaimToken() {
  return localStorage.getItem(CLAIM_STORAGE_KEY);
}

function mapSession(data, cafeSlug) {
  if (data.claim_token) storeClaimToken(data.claim_token);
  return {
    publicId: data.public_id,
    shortCode: data.short_code || null,
    claimToken: data.claim_token || getStoredClaimToken(),
    customerId: data.customer_id,
    cafeId: data.cafe_id,
    cafeSlug: data.cafe_slug || cafeSlug,
    stampsCount: data.stamps_count ?? 0,
    stampsRequired: data.stamps_required ?? BRAND.stampsRequired,
    cardsCompleted: data.cards_completed ?? 0,
    cafeName: data.cafe_name,
    brandColor: data.brand_color || BRAND.color,
    tagline: data.tagline || BRAND.tagline,
    rewardLabel: data.reward_label || BRAND.rewardLabel,
    themeStyle: resolveThemeStyle(
      data.cafe_slug || cafeSlug,
      data.theme_style || "solid",
    ),
    mode: "supabase",
  };
}

/**
 * Obtiene (o crea) el cliente + su tarjeta de fidelidad para un café.
 * Sin Supabase: solo usa localStorage y sellos mock.
 */
export async function ensureCustomerSession(cafeSlug = getActiveCafeSlug()) {
  setActiveCafeSlug(cafeSlug);

  if (!isSupabaseConfigured) {
    const publicId = getOrCreateLocalPublicId();
    const demo = getDemoCafe(cafeSlug);
    return {
      publicId,
      customerId: null,
      cafeId: null,
      cafeSlug,
      stampsCount: 4,
      stampsRequired: demo?.stampsRequired ?? BRAND.stampsRequired,
      cardsCompleted: 0,
      cafeName: demo?.name ?? BRAND.cafeName,
      brandColor: demo?.brandColor ?? BRAND.color,
      tagline: demo?.tagline ?? BRAND.tagline,
      rewardLabel: demo?.rewardLabel ?? BRAND.rewardLabel,
      themeStyle: resolveThemeStyle(cafeSlug, demo?.themeStyle),
      mode: "local",
    };
  }

  let publicId = getOrCreateLocalPublicId();
  let { data, error } = await supabase.rpc("ensure_customer_session", {
    p_cafe_slug: cafeSlug,
    p_public_id: publicId,
  });

  // ID con letras u obsoleto en el móvil → nuevo ID y reintento
  if (error && /ID de cliente no válido|invalid/i.test(error.message || "")) {
    publicId = getOrCreateLocalPublicId({ forceNew: true });
    ({ data, error } = await supabase.rpc("ensure_customer_session", {
      p_cafe_slug: cafeSlug,
      p_public_id: publicId,
    }));
  }

  if (error) throw error;
  return mapSession(data, cafeSlug);
}

/** Café + rol del barista autenticado. */
export async function fetchMyCafe() {
  if (!isSupabaseConfigured) {
    return {
      cafeId: null,
      cafeName: BRAND.cafeName,
      cafeSlug: BRAND.cafeSlug,
      stampsRequired: BRAND.stampsRequired,
      brandColor: BRAND.color,
      tagline: BRAND.tagline,
      rewardLabel: BRAND.rewardLabel,
      themeStyle: "solid",
      role: "owner",
      mode: "local",
    };
  }

  const { data, error } = await supabase.rpc("get_my_cafe");
  if (error) throw error;

  setActiveCafeSlug(data.cafe_slug);

  return {
    cafeId: data.cafe_id,
    cafeName: data.cafe_name,
    cafeSlug: data.cafe_slug,
    stampsRequired: data.stamps_required,
    brandColor: data.brand_color || BRAND.color,
    tagline: data.tagline || BRAND.tagline,
    rewardLabel: data.reward_label || BRAND.rewardLabel,
    themeStyle: resolveThemeStyle(
      data.cafe_slug,
      data.theme_style || "solid",
    ),
    role: data.role,
    mode: "supabase",
  };
}

/** Métricas del café del staff logueado. */
export async function fetchCafeMetrics() {
  if (!isSupabaseConfigured) {
    return {
      role: "owner",
      stamps_today: 12,
      cards_completed_total: 4,
      active_customers: 18,
      pending_nfc: 2,
      mode: "local",
    };
  }

  const { data, error } = await supabase.rpc("get_cafe_metrics");
  if (error) throw error;
  return { ...data, mode: "supabase" };
}

/** Crea una petición NFC pendiente (cliente → barista) vía RPC. */
export async function createNfcRequest({
  cafeSlug = getActiveCafeSlug(),
  publicId,
}) {
  if (!isSupabaseConfigured) {
    return { id: `local-${Date.now()}`, mode: "local" };
  }

  const { data, error } = await supabase.rpc("create_nfc_request", {
    p_cafe_slug: cafeSlug,
    p_public_id: publicId,
  });

  if (error) throw error;
  return { id: data.id, reused: Boolean(data.reused), mode: "supabase" };
}

/** Cancela una petición NFC pendiente (el propio cliente). */
export async function cancelNfcRequest({ requestId, publicId }) {
  if (!isSupabaseConfigured) {
    return { mode: "local", ok: true };
  }

  if (!requestId || String(requestId).startsWith("local-")) {
    return { mode: "local", ok: true };
  }

  const { data, error } = await supabase.rpc("cancel_nfc_request", {
    p_request_id: requestId,
    p_public_id: publicId,
  });

  if (error) throw error;
  return { ...data, mode: "supabase" };
}

/** Estado de una petición NFC (solo si pertenece a ese public_id). */
export async function fetchNfcRequestStatus(requestId, publicId) {
  if (!isSupabaseConfigured || !requestId || String(requestId).startsWith("local-")) {
    return null;
  }

  const { data, error } = await supabase.rpc("get_nfc_request_status", {
    p_request_id: requestId,
    p_public_id: publicId,
  });
  if (error) throw error;
  return data;
}

/**
 * Polling del estado NFC del cliente (sustituye Realtime anon).
 * Devuelve función cleanup.
 */
export function pollNfcRequest(requestId, publicId, onUpdate, intervalMs = 2000) {
  if (!isSupabaseConfigured || !requestId || String(requestId).startsWith("local-")) {
    return () => {};
  }

  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const status = await fetchNfcRequestStatus(requestId, publicId);
      if (!stopped && status) onUpdate(status);
    } catch (err) {
      console.error(err);
    }
  };

  tick();
  const timer = window.setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}

/** Snapshot de la tarjeta del cliente (polling seguro). */
export async function fetchCardSnapshot(cafeSlug, publicId) {
  if (!isSupabaseConfigured) {
    return null;
  }

  const { data, error } = await supabase.rpc("get_card_snapshot", {
    p_cafe_slug: cafeSlug,
    p_public_id: publicId,
  });
  if (error) throw error;
  return {
    publicId: data.public_id,
    shortCode: data.short_code,
    customerId: data.customer_id,
    cafeId: data.cafe_id,
    stampsCount: data.stamps_count ?? 0,
    stampsRequired: data.stamps_required,
    cardsCompleted: data.cards_completed ?? 0,
  };
}

/**
 * Polling de sellos del cliente (sustituye Realtime anon sobre loyalty_cards).
 *
 * En pantalla: 900 ms → el sello aparece casi al instante (momento de la demo).
 * En segundo plano: 15 s → no quema batería ni requests de Supabase.
 */
export function pollLoyaltyCard(
  { cafeSlug, publicId },
  onUpdate,
  { activeMs = 900, idleMs = 15_000 } = {},
) {
  if (!isSupabaseConfigured || !cafeSlug || !publicId) {
    return () => {};
  }

  let stopped = false;
  let timer = null;

  const schedule = () => {
    if (stopped) return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(tick, document.hidden ? idleMs : activeMs);
  };

  const tick = async () => {
    if (stopped) return;
    if (!document.hidden) {
      try {
        const snap = await fetchCardSnapshot(cafeSlug, publicId);
        if (!stopped && snap) onUpdate(snap);
      } catch (err) {
        console.error(err);
      }
    }
    schedule();
  };

  // Al volver a primer plano: refresco inmediato, sin esperar al siguiente tick
  const onVisibility = () => {
    if (!document.hidden) tick();
  };

  tick();
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

/** Realtime de tarjeta para staff autenticado (RLS por café). */
export function subscribeLoyaltyCard({ cafeId, customerId }, onUpdate) {
  if (!isSupabaseConfigured || !cafeId || !customerId) {
    return () => {};
  }

  const channel = supabase
    .channel(`loyalty-${cafeId}-${customerId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "loyalty_cards",
        filter: `customer_id=eq.${customerId}`,
      },
      (payload) => {
        if (payload.new.cafe_id === cafeId) onUpdate(payload.new);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

function formatRelativeTime(isoDate) {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
  if (diffSec < 60) return `Hace ${diffSec} seg`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  return `Hace ${hours} h`;
}

/** Lista peticiones NFC pendientes del café del staff (o slug indicado). */
export async function fetchPendingNfcRequests(cafeSlug) {
  const slug = cafeSlug || getActiveCafeSlug();

  if (!isSupabaseConfigured) {
    return {
      requests: [
        { id: 1, usuario: "usr_883", estado: "esperando", tiempo: "Hace 10 seg" },
        { id: 2, usuario: "usr_991", estado: "esperando", tiempo: "Hace 2 min" },
      ],
      cafeId: null,
      cafeName: BRAND.cafeName,
      cafeSlug: slug,
      mode: "local",
    };
  }

  // Preferir café del barista logueado
  let cafeId;
  let cafeName;
  let resolvedSlug = slug;

  try {
    const mine = await fetchMyCafe();
    cafeId = mine.cafeId;
    cafeName = mine.cafeName;
    resolvedSlug = mine.cafeSlug;
  } catch {
    const { data: cafe, error: cafeError } = await supabase
      .from("cafes")
      .select("id, name, slug")
      .eq("slug", slug)
      .single();
    if (cafeError) throw cafeError;
    cafeId = cafe.id;
    cafeName = cafe.name;
    resolvedSlug = cafe.slug;
  }

  const { data, error } = await supabase
    .from("nfc_requests")
    .select("id, public_id, status, created_at")
    .eq("cafe_id", cafeId)
    .eq("status", "esperando")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return {
    requests: (data ?? []).map((row) => ({
      id: row.id,
      usuario: row.public_id,
      estado: row.status,
      tiempo: formatRelativeTime(row.created_at),
      createdAt: row.created_at,
    })),
    cafeId,
    cafeName,
    cafeSlug: resolvedSlug,
    mode: "supabase",
  };
}

/** Suscripción Realtime a nuevas / actualizadas peticiones NFC. */
export function subscribePendingNfcRequests(cafeId, onChange) {
  if (!isSupabaseConfigured || !cafeId) {
    return () => {};
  }

  const channel = supabase
    .channel(`nfc-inbox-${cafeId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "nfc_requests",
        filter: `cafe_id=eq.${cafeId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Aprueba un punto: RPC atómica en Supabase
 * (suma sello + marca petición + registra historial).
 */
export async function approveNfcRequest(requestId) {
  if (!isSupabaseConfigured) {
    return { public_id: null, mode: "local" };
  }

  const { data, error } = await supabase.rpc("approve_nfc_stamp", {
    p_request_id: requestId,
  });

  if (error) throw error;
  return { ...data, mode: "supabase" };
}

/** Rechaza una petición NFC (sin sumar sello). Solo barista autenticado. */
export async function rejectNfcRequest(requestId) {
  if (!isSupabaseConfigured) {
    return { mode: "local" };
  }

  const { error } = await supabase.rpc("reject_nfc_stamp", {
    p_request_id: requestId,
  });

  if (error) throw error;
  return { mode: "supabase" };
}

/** Últimos puntos aprobados hoy (historial del panel). */
export async function fetchTodayApprovals(cafeId) {
  if (!isSupabaseConfigured || !cafeId) {
    return ["usr_112", "usr_445"];
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("stamp_events")
    .select("public_id, created_at")
    .eq("cafe_id", cafeId)
    .gte("created_at", startOfDay.toISOString())
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) throw error;
  return (data ?? []).map((row) => row.public_id);
}

/**
 * Extrae código de cliente desde texto escaneado o pegado.
 * Acepta: código corto 4–5 dígitos, "usr_12345", URLs con ?u=, etc.
 */
export function parseCustomerPublicId(raw) {
  if (!raw) return null;
  const text = String(raw).trim().replace(/^["']|["']$/g, "");

  if (/^[0-9]{4,5}$/.test(text)) return text;

  const direct = text.match(/(usr_[0-9]{5,12})/i);
  if (direct) return direct[1];

  const stamped = text.match(/stamp:([^\s]+)/i);
  if (stamped) return parseCustomerPublicId(stamped[1]);

  try {
    const url = new URL(text);
    const fromQuery =
      url.searchParams.get("u") ||
      url.searchParams.get("user") ||
      url.searchParams.get("id") ||
      url.searchParams.get("code");
    if (fromQuery) return parseCustomerPublicId(fromQuery);
    const pathMatch = url.pathname.match(/(usr_[0-9]{5,12})/i);
    if (pathMatch) return pathMatch[1];
  } catch {
    // no es URL
  }

  if (/^usr_[0-9]{5,12}$/i.test(text)) return text;
  return null;
}

/** Busca un cliente y su tarjeta en un café (usr_… o código corto). */
export async function findCustomerByPublicId(publicId) {
  const cleanId = parseCustomerPublicId(publicId);
  if (!cleanId) {
    throw new Error("Código no válido. Usa 4 dígitos (ej. 4821) o usr_…");
  }

  if (!isSupabaseConfigured) {
    return {
      publicId: cleanId.startsWith("usr_") ? cleanId : `usr_${cleanId}`,
      shortCode: /^[0-9]{4,5}$/.test(cleanId) ? cleanId : "4821",
      stampsCount: 3,
      stampsRequired: BRAND.stampsRequired,
      cardsCompleted: 1,
      cafeName: BRAND.cafeName,
      mode: "local",
    };
  }

  const { data, error } = await supabase.rpc("get_customer_card", {
    p_public_id: cleanId,
  });

  if (error) {
    if (/no encontrado|Cliente no encontrado/i.test(error.message || "")) {
      throw new Error(`No existe el cliente ${cleanId}.`);
    }
    throw error;
  }

  return {
    publicId: data.public_id,
    shortCode: data.short_code || null,
    customerId: data.customer_id,
    cafeId: data.cafe_id,
    stampsCount: data.stamps_count ?? 0,
    stampsRequired: data.stamps_required ?? BRAND.stampsRequired,
    cardsCompleted: data.cards_completed ?? 0,
    cafeName: data.cafe_name,
    mode: "supabase",
  };
}

/**
 * Añade +1 sello directo (flujo QR / búsqueda manual).
 * El café lo determina el barista autenticado en el servidor.
 */
export async function addStampByPublicId(publicId) {
  const cleanId = parseCustomerPublicId(publicId);
  if (!cleanId) {
    throw new Error("ID de cliente no válido.");
  }

  if (!isSupabaseConfigured) {
    return {
      public_id: cleanId,
      stamps_count: null,
      cards_completed: null,
      card_completed: false,
      mode: "local",
    };
  }

  // p_cafe_slug: null a propósito. El servidor deriva el café desde auth.uid();
  // mandar el slug de localStorage podía bloquear sellos si estaba obsoleto.
  const { data, error } = await supabase.rpc("add_stamp_by_public_id", {
    p_cafe_slug: null,
    p_public_id: cleanId,
  });

  if (error) throw error;
  return { ...data, mode: "supabase" };
}

/** Quita 1 sello (corregir error). Solo barista del café. */
export async function removeStampByPublicId(publicId) {
  const cleanId = parseCustomerPublicId(publicId);
  if (!cleanId) {
    throw new Error("ID de cliente no válido.");
  }

  if (!isSupabaseConfigured) {
    return {
      public_id: cleanId,
      stamps_count: null,
      cards_completed: null,
      mode: "local",
    };
  }

  // p_cafe_slug: null — igual que add_stamp, el café sale de la sesión del barista.
  const { data, error } = await supabase.rpc("remove_stamp_by_public_id", {
    p_cafe_slug: null,
    p_public_id: cleanId,
  });

  if (error) throw error;
  return { ...data, mode: "supabase" };
}

/**
 * Reinicia sellos a 0 tras completar un cartón.
 * Cliente: necesita claim_token del móvil. Staff autenticado: no lo necesita.
 */
export async function startNewCard(
  publicId,
  cafeSlug = getActiveCafeSlug(),
  claimToken = getStoredClaimToken(),
) {
  const cleanId = parseCustomerPublicId(publicId);
  if (!cleanId) {
    throw new Error("ID de cliente no válido.");
  }

  if (!isSupabaseConfigured) {
    return {
      public_id: cleanId,
      stamps_count: 0,
      cards_completed: null,
      card_completed: false,
      mode: "local",
    };
  }

  const { data, error } = await supabase.rpc("start_new_card", {
    p_cafe_slug: cafeSlug,
    p_public_id: cleanId,
    p_claim_token: claimToken || null,
  });

  if (error) throw error;
  return { ...data, mode: "supabase" };
}
