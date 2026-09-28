'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { compact, ticks } from '@/lib/admin/chart-scale'
import { cn } from '@/lib/utils'

// ============================================================
// EĞİLİM GRAFİĞİ — tek seri, çizgi ya da sütun (bağımlılıksız SVG).
//
// dataviz kuralları:
//   - TEK SERİ: lejant yok, başlık neyin çizildiğini söyler; birden fazla
//     ölçü = birden fazla küçük grafik (çift eksen YOK).
//   - Eksen sıfırdan, yuvarlak üst değer; ızgara 1px, silik.
//   - Çizgi 2px; sütun ≤24px, uç 4px yuvarlak, taban düz; komşu sütunlar
//     arasında 2px yüzey boşluğu.
//   - Renk --chart-1 (açık/koyu ayrı doğrulandı: globals.css). Metin
//     hiçbir zaman seri renginde değil.
//   - ETKİLEŞİM: imleç en yakın güne oturur (çizgide dikey çizgi), ipucu
//     değeri gösterir; klavyede ←/→ aynı şeyi yapar.
//   - İpucu bir şeyi GİZLEMEZ: her değer "Tablo" görünümünde de var.
// ============================================================

export interface TrendPoint {
  /** Tarih etiketi (ör. "27 Eyl"). */
  label: string
  value: number
}

const HEIGHT = 160
const PAD = { top: 12, right: 8, bottom: 22, left: 40 }

export function TrendChart({
  title,
  data,
  kind = 'line',
  format = compact,
  className,
}: {
  /** Ekran okuyucu ve tablo başlığı. */
  title: string
  data: TrendPoint[]
  kind?: 'line' | 'bar'
  format?: (n: number) => string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(560)
  const [active, setActive] = useState<number | null>(null)
  const tableId = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const max = Math.max(0, ...data.map((d) => d.value))
  const [, mid, top] = ticks(max)
  const innerW = width - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const n = data.length
  const step = n > 0 ? innerW / n : innerW
  const x = (i: number) => PAD.left + step * i + step / 2
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH
  const barW = Math.max(2, Math.min(24, step - 2))

  function pick(clientX: number) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || n === 0) return
    const i = Math.floor((clientX - rect.left - PAD.left) / step)
    setActive(Math.max(0, Math.min(n - 1, i)))
  }

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.value)}`).join(' ')
  const areaPath =
    n > 0 ? `${linePath} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z` : ''
  const total = data.reduce((s, d) => s + d.value, 0)
  const labelIdx = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : data.map((_, i) => i)

  return (
    <figure className={cn('space-y-1', className)}>
      <div
        ref={ref}
        className="relative"
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
      >
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${title}: toplam ${format(total)}, en yüksek ${format(max)}`}
          aria-describedby={tableId}
          tabIndex={0}
          className="block max-w-full rounded focus-visible:outline-2 focus-visible:outline-ring"
          onKeyDown={(e) => {
            if (n === 0) return
            if (e.key === 'ArrowRight') setActive((a) => Math.min(n - 1, (a ?? -1) + 1))
            if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? n) - 1))
            if (e.key === 'Escape') setActive(null)
          }}
          onBlur={() => setActive(null)}
        >
          {/* Izgara: 0 / yarı / üst — 1px, silik, düz. */}
          {[0, mid, top].map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {format(t)}
              </text>
            </g>
          ))}

          {kind === 'line' ? (
            <>
              <path d={areaPath} className="fill-chart-1" opacity={0.1} />
              <path
                d={linePath}
                fill="none"
                className="stroke-chart-1"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {n > 0 && (
                // Son değer noktası: ≥8px, 2px yüzey halkası.
                <circle cx={x(n - 1)} cy={y(data[n - 1].value)} r={4} className="fill-chart-1 stroke-card" strokeWidth={2} />
              )}
            </>
          ) : (
            data.map((d, i) => {
              const h = Math.max(0, y(0) - y(d.value))
              const r = Math.min(4, h, barW / 2)
              const x0 = x(i) - barW / 2
              const y0 = y(d.value)
              // Üst köşeler yuvarlak, taban düz.
              const path =
                h === 0
                  ? ''
                  : `M${x0},${y0 + h} L${x0},${y0 + r} Q${x0},${y0} ${x0 + r},${y0} L${x0 + barW - r},${y0} Q${x0 + barW},${y0} ${x0 + barW},${y0 + r} L${x0 + barW},${y0 + h} Z`
              return (
                <path
                  key={i}
                  d={path}
                  className={cn('fill-chart-1', active !== null && active !== i && 'opacity-60')}
                />
              )
            })
          )}

          {/* İmleç: çizgide dikey hairline + nokta. */}
          {active !== null && n > 0 && kind === 'line' && (
            <>
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} className="stroke-muted-foreground" strokeWidth={1} />
              <circle cx={x(active)} cy={y(data[active].value)} r={4} className="fill-chart-1 stroke-card" strokeWidth={2} />
            </>
          )}

          {labelIdx.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={HEIGHT - 6}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              className="fill-muted-foreground text-[10px]"
            >
              {data[i]?.label}
            </text>
          ))}
        </svg>

        {active !== null && n > 0 && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm"
            style={{
              left: Math.min(Math.max(0, x(active) - 50), width - 110),
            }}
          >
            <p className="font-semibold tabular-nums">{format(data[active].value)}</p>
            <p className="text-muted-foreground">{data[active].label}</p>
          </div>
        )}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Tablo</summary>
        <table id={tableId} className="mt-1 w-full max-w-sm">
          <caption className="sr-only">{title}</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-b last:border-0">
                <td className="py-0.5 text-muted-foreground">{d.label}</td>
                <td className="py-0.5 text-right tabular-nums">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
