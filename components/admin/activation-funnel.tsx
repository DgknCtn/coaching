import { activationFunnel, formatHours, type ActivationRow } from '@/lib/activation'

// AKTİVASYON HUNİSİ (B17 · 120) — Kullanım sekmesinde çizilir.
// Oran: aralıkta açılan alanlara göre. Süre: açılıştan o adıma ortanca.

export function ActivationFunnel({ rows }: { rows: ActivationRow[] }) {
  const funnel = activationFunnel(rows)
  return (
    <ol className="space-y-2">
      {funnel.map((step) => (
        <li
          key={step.key}
          className="grid grid-cols-[10rem_1fr_auto] items-center gap-3 text-sm max-sm:grid-cols-1"
        >
          <span>{step.label}</span>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${step.label}: yüzde ${step.percent}`}
          >
            <div className="h-full rounded-full bg-chart-1" style={{ width: `${step.percent}%` }} />
          </div>
          <span className="tabular-nums text-muted-foreground">
            {step.reached} · %{step.percent}
            {step.key !== 'created' && ` · ${formatHours(step.medianHours)}`}
          </span>
        </li>
      ))}
    </ol>
  )
}
