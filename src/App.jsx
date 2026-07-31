import { useEffect, useState } from "react";
import AdminPanel from "./AdminPanel.jsx";
import LoyaltyCard from "./LoyaltyCard.jsx";

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

  return vista === "admin" ? <AdminPanel /> : <LoyaltyCard />;
}
