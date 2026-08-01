import { Coffee, Trophy, Users, Zap } from "lucide-react";
import { useT } from "../i18n/LanguageContext.jsx";

/**
 * Panel de métricas del café (barista ve resumen; owner ve lo mismo ampliado).
 */
export default function CafeMetrics({ metrics, role }) {
  const t = useT();
  if (!metrics) return null;

  const items = [
    {
      label: t("metrics.stampsToday"),
      value: metrics.stamps_today ?? 0,
      icon: Zap,
    },
    {
      label: t("metrics.pendingNfc"),
      value: metrics.pending_nfc ?? 0,
      icon: Coffee,
    },
    {
      label: t("metrics.activeCustomers"),
      value: metrics.active_customers ?? 0,
      icon: Users,
    },
    {
      label: t("metrics.cardsCompleted"),
      value: metrics.cards_completed_total ?? 0,
      icon: Trophy,
    },
  ];

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-900">
          {role === "owner" ? t("metrics.ownerTitle") : t("metrics.baristaTitle")}
        </h2>
        {role === "owner" && (
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-brand">
            Owner
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-3xl bg-white p-4 shadow-sm"
            >
              <div className="mb-2 flex items-center gap-2 text-gray-400">
                <Icon className="size-4" strokeWidth={2.5} />
                <span className="text-[11px] font-bold uppercase tracking-wide">
                  {item.label}
                </span>
              </div>
              <p className="text-2xl font-extrabold text-gray-900">
                {item.value}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
