import { lazy, Suspense, useEffect, useState } from "react";
import LoyaltyCard from "./LoyaltyCard.jsx";

// El panel de barista (con el escáner) no viaja al móvil del cliente.
const AdminPanel = lazy(() => import("./AdminPanel.jsx"));

/**
 * Router mínimo por hash:
 * - #/ o sin hash → vista del cliente (LoyaltyCard)
 * - #admin → Panel de Administrador (Barista)
 */
export default function App() {
  const [vista, setVista] = useState(() =>
    window.location.hash === "#admin" ? "admin" : "cliente",
  );

  useEffect(() => {
    const onHashChange = () => {
      setVista(window.location.hash === "#admin" ? "admin" : "cliente");
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (vista !== "admin") return <LoyaltyCard />;

  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-stone-100" aria-busy="true" />
      }
    >
      <AdminPanel />
    </Suspense>
  );
}
