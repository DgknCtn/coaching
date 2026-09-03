'use client'

import { FLOW_STATUS_LABEL, deriveFlowStatus, type FlowItem } from '@/lib/curriculum-flow'
import { cn } from '@/lib/utils'

// Müfredat akışı zaman çizelgesi (R5.2 sunumu).
//
// Akış bugüne kadar yalnız satır listesi olarak görünüyordu: tarihler
// kolonlardaydı ama konuların birbirine göre NEREDE durduğu, hangisinin ne
// kadar sürdüğü ve şu an nerede olunduğu okunmuyordu.
//
// Bu bileşen SALT GÖRÜNÜMDÜR ve veri değiştirmez:
//   - Sürükleme yok. Taşıma ve süre değişimi satırdaki mevcut kontrollerle
//     yapılır; o işlemler lib/curriculum-flow.ts'teki zincirleme mantığa
//     bağlıdır ve piksel sürüklemesiyle temsil edilirse yanlış beklenti
//     yaratır ("istediğim yere bırakırım" — oysa devamı da kayar).
//   - Renkler durumdan gelir; her blokta konu adı da yazar, renk tek başına
//     anlam taşımaz.
//
// Hafta ızgarası CSS grid ile çizilir: en erken başlangıç 1. hafta kabul
// edilir, her konu kendi başlangıç/bitiş haftasına yerleşir.

const BAR_STYLE: Record<string, string> = {
  passed: 'bg-success-subtle text-success-foreground border-success-border',
  current: 'bg-info-subtle text-info-foreground border-info-border',
  upcoming: 'bg-muted text-muted-foreground border-border',
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

function weekIndex(from: string, date: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const point = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(point)) return 0
  return Math.max(0, Math.floor((point - start) / MS_PER_WEEK))
}

export function FlowTimeline({
  items,
  today,
  selectedId,
  onSelect,
  className,
}: {
  items: FlowItem[]
  today: string
  selectedId?: string | null
  onSelect?: (item: FlowItem) => void
  className?: string
}) {
  if (items.length === 0) return null

  const firstStart = items.reduce(
    (min, item) => (item.startDate < min ? item.startDate : min),
    items[0].startDate
  )
  const lastEnd = items.reduce(
    (max, item) => (item.endDate > max ? item.endDate : max),
    items[0].endDate
  )

  const totalWeeks = Math.max(1, weekIndex(firstStart, lastEnd) + 1)
  const currentWeek = weekIndex(firstStart, today)
  const showMarker = currentWeek >= 0 && currentWeek < totalWeeks

  return (
    <div className={cn('overflow-x-auto rounded-xl border bg-card', className)}>
      <div className="min-w-[640px] p-4">
        {/* Hafta başlıkları: her 4 haftada bir numara — 40 haftalık akışta
            her haftayı yazmak okunmaz bir şerit üretiyor. */}
        <div
          className="mb-2 grid gap-px text-[10px] text-muted-foreground"
          style={{ gridTemplateColumns: `10rem repeat(${totalWeeks}, minmax(0, 1fr))` }}
        >
          <span />
          {Array.from({ length: totalWeeks }, (_, i) => (
            <span key={i} className="text-center tabular-nums">
              {i % 4 === 0 ? i + 1 : ''}
            </span>
          ))}
        </div>

        <div className="space-y-1">
          {items.map((item, index) => {
            const status = deriveFlowStatus(item, today)
            const start = weekIndex(firstStart, item.startDate)
            const span = Math.max(1, weekIndex(firstStart, item.endDate) - start + 1)
            const selected = !!item.id && item.id === selectedId

            return (
              <div
                key={item.id ?? `yeni-${index}`}
                className="grid items-center gap-px"
                style={{ gridTemplateColumns: `10rem repeat(${totalWeeks}, minmax(0, 1fr))` }}
              >
                <button
                  type="button"
                  onClick={() => onSelect?.(item)}
                  className={cn(
                    'truncate rounded px-1 py-1 text-left text-xs transition-colors hover:bg-muted',
                    selected && 'font-medium text-primary'
                  )}
                >
                  {item.name}
                </button>

                {/* Blok, kendi başlangıç sütununda başlar ve süresi kadar
                    sütun kaplar. Boş sütunlar için ayrı hücre üretilmez;
                    grid-column ile konumlanır. */}
                <button
                  type="button"
                  onClick={() => onSelect?.(item)}
                  title={`${item.name} · ${FLOW_STATUS_LABEL[status]}`}
                  style={{ gridColumn: `${start + 2} / span ${span}` }}
                  className={cn(
                    'h-5 rounded border transition-opacity hover:opacity-80',
                    BAR_STYLE[status],
                    selected && 'ring-2 ring-primary ring-offset-1 ring-offset-card'
                  )}
                >
                  <span className="sr-only">
                    {item.name} — {FLOW_STATUS_LABEL[status]}
                  </span>
                </button>
              </div>
            )
          })}
        </div>

        {showMarker && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Bu hafta: {currentWeek + 1}. hafta / {totalWeeks}
          </p>
        )}
      </div>
    </div>
  )
}
