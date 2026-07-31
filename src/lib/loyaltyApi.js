import { BRAND } from "../config/brand.js";
import { isSupabaseConfigured, supabase } from "./supabase.js";

function generatePublicId() {
  return `usr_${Math.floor(10000 + Math.random() * 90000)}`;
}

function getOrCreateLocalPublicId() {
  let publicId = localStorage.getItem(BRAND.storageKey);
  if (!publicId) {
    publicId = generatePublicId();
    localStorage.setItem(BRAND.storageKey, publicId);
  }
  return publicId;
}

/**
 * Obtiene (o crea) el cliente + su tarjeta de fidelidad para el café demo.
 * Sin Supabase: solo usa localStorage y sellos mock.
 */
export async function ensureCustomerSession() {
  const publicId = getOrCreateLocalPublicId();

  if (!isSupabaseConfigured) {
    return {
      publicId,
      customerId: null,
      cafeId: null,
      stampsCount: 4,
      stampsRequired: BRAND.stampsRequired,
      cardsCompleted: 0,
      cafeName: BRAND.cafeName,
      mode: "local",
    };
  }

  // 1) Café demo (por slug)
  const { data: cafe, error: cafeError } = await supabase
    .from("cafes")
    .select("id, name, stamps_required")
    .eq("slug", BRAND.cafeSlug)
    .single();

  if (cafeError) throw cafeError;

  // 2) Cliente por public_id
  let { data: customer } = await supabase
    .from("customers")
    .select("id, public_id")
    .eq("public_id", publicId)
    .maybeSingle();

  if (!customer) {
    const { data: created, error: createError } = await supabase
      .from("customers")
      .insert({ public_id: publicId })
      .select("id, public_id")
      .single();

    if (createError) throw createError;
    customer = created;
  }

  // 3) Tarjeta de fidelidad (cafe + customer)
  let { data: card } = await supabase
    .from("loyalty_cards")
    .select("id, stamps_count, cards_completed")
    .eq("cafe_id", cafe.id)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (!card) {
    const { data: createdCard, error: cardError } = await supabase
      .from("loyalty_cards")
      .insert({
        cafe_id: cafe.id,
        customer_id: customer.id,
        stamps_count: 0,
        cards_completed: 0,
      })
      .select("id, stamps_count, cards_completed")
      .single();

    if (cardError) throw cardError;
    card = createdCard;
  }

  return {
    publicId: customer.public_id,
    customerId: customer.id,
    cafeId: cafe.id,
    stampsCount: card.stamps_count,
    stampsRequired: cafe.stamps_required ?? BRAND.stampsRequired,
    cardsCompleted: card.cards_completed ?? 0,
    cafeName: cafe.name,
    mode: "supabase",
  };
}

/** Crea una petición NFC pendiente (cliente → barista). */
export async function createNfcRequest({ cafeId, customerId, publicId }) {
  if (!isSupabaseConfigured) {
    return { id: `local-${Date.now()}`, mode: "local" };
  }

  const { data, error } = await supabase
    .from("nfc_requests")
    .insert({
      cafe_id: cafeId,
      customer_id: customerId,
      public_id: publicId,
      status: "esperando",
    })
    .select("id")
    .single();

  if (error) throw error;
  return { ...data, mode: "supabase" };
}

/** Escucha cambios de una petición NFC (aprobada / rechazada). */
export function subscribeNfcRequest(requestId, onUpdate) {
  if (!isSupabaseConfigured || !requestId || String(requestId).startsWith("local-")) {
    return () => {};
  }

  const channel = supabase
    .channel(`nfc-request-${requestId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "nfc_requests",
        filter: `id=eq.${requestId}`,
      },
      (payload) => onUpdate(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Escucha cambios en la tarjeta (sellos) del cliente. */
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

/** Lista peticiones NFC pendientes del café demo. */
export async function fetchPendingNfcRequests(cafeSlug = BRAND.cafeSlug) {
  if (!isSupabaseConfigured) {
    return {
      requests: [
        { id: 1, usuario: "usr_883", estado: "esperando", tiempo: "Hace 10 seg" },
        { id: 2, usuario: "usr_991", estado: "esperando", tiempo: "Hace 2 min" },
      ],
      cafeId: null,
      cafeName: BRAND.cafeName,
      mode: "local",
    };
  }

  const { data: cafe, error: cafeError } = await supabase
    .from("cafes")
    .select("id, name")
    .eq("slug", cafeSlug)
    .single();

  if (cafeError) throw cafeError;

  const { data, error } = await supabase
    .from("nfc_requests")
    .select("id, public_id, status, created_at")
    .eq("cafe_id", cafe.id)
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
    cafeId: cafe.id,
    cafeName: cafe.name,
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
 * Extrae un public_id limpio desde texto escaneado o pegado.
 * Acepta: "usr_12345", "stamp:usr_12345", URLs con ?id=, etc.
 */
export function parseCustomerPublicId(raw) {
  if (!raw) return null;
  const text = String(raw).trim().replace(/^["']|["']$/g, "");

  const direct = text.match(/(usr_\d+)/i);
  if (direct) return direct[1];

  const stamped = text.match(/stamp:([^\s]+)/i);
  if (stamped) return parseCustomerPublicId(stamped[1]);

  try {
    const url = new URL(text);
    const fromQuery = url.searchParams.get("id") || url.searchParams.get("user");
    if (fromQuery) return parseCustomerPublicId(fromQuery);
    const pathMatch = url.pathname.match(/(usr_\d+)/i);
    if (pathMatch) return pathMatch[1];
  } catch {
    // no es URL
  }

  if (/^usr_/i.test(text)) return text;
  return null;
}

/** Busca un cliente y su tarjeta en el café demo. */
export async function findCustomerByPublicId(publicId, cafeSlug = BRAND.cafeSlug) {
  const cleanId = parseCustomerPublicId(publicId);
  if (!cleanId) {
    throw new Error("ID de cliente no válido. Usa el formato usr_12345.");
  }

  if (!isSupabaseConfigured) {
    return {
      publicId: cleanId,
      stampsCount: 3,
      stampsRequired: BRAND.stampsRequired,
      cardsCompleted: 1,
      cafeName: BRAND.cafeName,
      mode: "local",
    };
  }

  const { data: cafe, error: cafeError } = await supabase
    .from("cafes")
    .select("id, name, stamps_required")
    .eq("slug", cafeSlug)
    .single();

  if (cafeError) throw cafeError;

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, public_id")
    .eq("public_id", cleanId)
    .maybeSingle();

  if (customerError) throw customerError;
  if (!customer) {
    throw new Error(`No existe el cliente ${cleanId}.`);
  }

  const { data: card } = await supabase
    .from("loyalty_cards")
    .select("stamps_count, cards_completed")
    .eq("cafe_id", cafe.id)
    .eq("customer_id", customer.id)
    .maybeSingle();

  return {
    publicId: customer.public_id,
    customerId: customer.id,
    cafeId: cafe.id,
    stampsCount: card?.stamps_count ?? 0,
    stampsRequired: cafe.stamps_required ?? BRAND.stampsRequired,
    cardsCompleted: card?.cards_completed ?? 0,
    cafeName: cafe.name,
    mode: "supabase",
  };
}

/**
 * Añade +1 sello directo (flujo QR / búsqueda manual).
 * Usa la RPC add_stamp_by_public_id en Supabase.
 */
export async function addStampByPublicId(publicId, cafeSlug = BRAND.cafeSlug) {
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

  const { data, error } = await supabase.rpc("add_stamp_by_public_id", {
    p_cafe_slug: cafeSlug,
    p_public_id: cleanId,
  });

  if (error) throw error;
  return { ...data, mode: "supabase" };
}

/** Reinicia sellos a 0 tras completar un cartón (mantiene cards_completed). */
export async function startNewCard(publicId, cafeSlug = BRAND.cafeSlug) {
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
  });

  if (error) throw error;
  return { ...data, mode: "supabase" };
}
