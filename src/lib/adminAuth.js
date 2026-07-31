import { isSupabaseConfigured, supabase } from "./supabase.js";

const LOCAL_PIN_KEY = "stamp_admin_unlocked";
const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || "stamp-demo";

/** ¿Hay PIN configurado para modo local / respaldo? */
export function hasLocalAdminPin() {
  return Boolean(import.meta.env.VITE_ADMIN_PIN) || !isSupabaseConfigured;
}

export function isLocalAdminUnlocked() {
  return sessionStorage.getItem(LOCAL_PIN_KEY) === "1";
}

export function unlockLocalAdmin(pin) {
  if (String(pin) !== String(ADMIN_PIN)) {
    throw new Error("PIN incorrecto");
  }
  sessionStorage.setItem(LOCAL_PIN_KEY, "1");
}

export function lockLocalAdmin() {
  sessionStorage.removeItem(LOCAL_PIN_KEY);
}

export async function getAdminSession() {
  if (!isSupabaseConfigured) {
    return isLocalAdminUnlocked() ? { mode: "local" } : null;
  }

  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export async function loginAdmin(email, password) {
  if (!isSupabaseConfigured) {
    unlockLocalAdmin(password);
    return { mode: "local" };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) throw error;
  return data.session;
}

export async function logoutAdmin() {
  lockLocalAdmin();
  if (isSupabaseConfigured) {
    await supabase.auth.signOut();
  }
}

export function onAdminAuthChange(callback) {
  if (!isSupabaseConfigured) {
    callback(isLocalAdminUnlocked() ? { mode: "local" } : null);
    return () => {};
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return () => subscription.unsubscribe();
}
