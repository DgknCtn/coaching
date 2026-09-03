'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FLOW_STATUS_LABEL,
  durationWeeks,
  flowItemKey,
  moveItem,
  resizeItem,
  type FlowItem,
  type FlowStatus,
} from '@/lib/curriculum-flow'
import { cn } from '@/lib/utils'

// Müfredat akışı zaman çizelgesi (R5.2 sunumu).
//
// Akış bugüne kadar yalnız satır listesi olarak görünüyordu: tarihler
// kolonlardaydı ama konuların birbirine göre NEREDE durduğu, hangisinin ne
// kadar sürdüğü ve şu an nerede olunduğu okunmuyordu.
//
// SÜRÜKLEME (referans tasarım kararı).
//
//   Bu dosya önce bilinçli olarak sürüklemesizdi; gerekçesi şuydu: taşıma ve
//   süre değişimi ZİNCİRLEME kaydırma yapar, piksel sürüklemesi ise
//   "istediğim yere bırakırım" beklentisi yaratır. O gerekçe geçersiz
//   kılınmadı, KARŞILANDI: sürükleme sırasında zincirleme sonucun kendisi
//   canlı çizilir — kullanıcı devamının da kaydığını bırakmadan ÖNCE görür.
//
//   İki tutamak vardır:
//     gövde      -> taşıma (moveItem), hafta sütununa snap
//     sağ kenar  -> süre değiştirme (resizeItem), en az 1 hafta
//
//   Sürükleme TEK YOL DEĞİLDİR: satır menüsündeki ileri/geri ve süre
//   komutları duruyor, klavye kullanıcısı onlarla çalışır. Kaydedilmemiş
//   (id'siz) blok sürüklenemez — seçilemezlik kuralıyla aynı.
//
//   Sürükleme VERİYİ KAYDETMEZ: sonuç çağırana verilir, kayıt "Akışı
//   Kaydet" ile toplu yapılır.
//
// Hafta ızgarası CSS grid ile çizilir: en erken başlangıç 1. hafta kabul
// edilir, her konu kendi başlangıç/bitiş haftasına yerleşir.

const BAR_STYLE: Record<FlowStatus, string> = {
  passed: 'bg-success-subtle text-success-foreground border-success-border',
  in_progress: 'bg-info-subtle text-info-foreground border-info-border',
  current: 'bg-primary/15 text-primary border-primary/40',
  soon: 'bg-warning-subtle text-warning-foreground border-warning-border',
  later: 'bg-muted text-muted-foreground border-border',
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
/** Sol etiket kolonunun genişliği; sütun genişliği hesabı da buna dayanır. */
const LABEL_REM = 10

function weekIndex(from: string, date: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const point = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(point)) return 0
  return Math.max(0, Math.floor((point - start) / MS_PER_WEEK))
}

/** Bir hafta sütununun başladığı günün ay adı. */
function monthOf(from: string, week: number): string {
  const d = new Date(Date.parse(`${from}T00:00:00Z`) + week * MS_PER_WEEK)
  return d.toLocaleDateString('tr-TR', { month: 'long', timeZone: 'UTC' })
}

/** Ardışık aynı aya ait haftaları tek başlıkta toplar. */
function monthSpans(from: string, totalWeeks: number): { label: string; span: number }[] {
  const out: { label: string; span: number }[] = []
  for (let i = 0; i < totalWeeks; i++) {
    const label = monthOf(from, i)
    const last = out[out.length - 1]
    if (last && last.label === label) last.span += 1
    else out.push({ label, span: 1 })
  }
  return out
}

type DragKind = 'move' | 'resize'

interface DragState {
  itemId: string
  kind: DragKind
  startX: number
  /** Başlangıçtan bu yana kaç hafta — canlı önizlemenin tek girdisi. */
  deltaWeeks: number
}

export function FlowTimeline({
  items,
  today,
  statuses,
  selectedId,
  onSelect,
  onChange,
  className,
}: {
  items: FlowItem[]
  today: string
  /** Durum haritası dışarıdan gelir; tablo ve çizelge aynı kaynağı kullanır. */
  statuses: Map<string, FlowStatus>
  selectedId?: string | null
  onSelect?: (item: FlowItem) => void
  /** Verilmezse çizelge salt görünümdür ve sürükleme kapalıdır. */
  onChange?: (next: FlowItem[]) => void
  className?: string
}) {
  const gridRef = useRef<HTMLDivElement>(null)
  const totalColumns = useRef(1)
  const [drag, setDrag] = useState<DragState | null>(null)

  // Sonuç yalnız BIRAKINCA uygulanır: her pointermove'da onChange çağırmak
  // ara durumları üst state'e yazar ve "kaydedilmedi" işaretini her piksel
  // hareketinde tetiklerdi.
  const commit = useCallback(
    (state: DragState) => {
      if (state.deltaWeeks === 0) return
      const target = items.find(i => i.id === state.itemId)
      if (!target) return

      const next =
        state.kind === 'move'
          ? moveItem(items, state.itemId, state.deltaWeeks)
          : resizeItem(items, state.itemId, durationWeeks(target) + state.deltaWeeks)

      onChange?.(next)
    },
    [items, onChange]
  )

  useEffect(() => {
    if (!drag) return

    function columnWidth(): number {
      const el = gridRef.current
      if (!el) return 48
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const usable = el.clientWidth - LABEL_REM * rem
      return Math.max(8, usable / Math.max(1, totalColumns.current))
    }

    function onMove(event: PointerEvent) {
      const width = columnWidth()
      setDrag(current => {
        if (!current) return current
        const delta = Math.round((event.clientX - current.startX) / width)
        return delta === current.deltaWeeks ? current : { ...current, deltaWeeks: delta }
      })
    }

    function onUp() {
      setDrag(current => {
        if (current) commit(current)
        return null
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [drag, commit])

  if (items.length === 0) return null

  const firstStart = items.reduce(
    (min, item) => (item.startDate < min ? item.startDate : min),
    items[0].startDate
  )
  const lastEnd = items.reduce(
    (max, item) => (item.endDate > max ? item.endDate : max),
    items[0].endDate
  )

  const baseWeeks = Math.max(1, weekIndex(firstStart, lastEnd) + 1)
  // İleri sürüklerken ızgara dar kalmamalı; blok görünürde kalsın.
  const totalWeeks = baseWeeks + (drag ? Math.max(0, drag.deltaWeeks) : 0)
  totalColumns.current = totalWeeks

  const currentWeek = weekIndex(firstStart, today)
  const showMarker = currentWeek >= 0 && currentWeek < baseWeeks
  const gridColumns = `${LABEL_REM}rem repeat(${totalWeeks}, minmax(0, 1fr))`
  const dragIndex = drag ? items.findIndex(i => i.id === drag.itemId) : -1

  /**
   * Sürükleme önizlemesi. Kural lib'deki zincirleme mantığın AYNISI:
   *   taşıma  — sürüklenen blok ve DEVAMI birlikte kayar
   *   boyut   — blok uzar/kısalır, devamı fark kadar kayar
   * Burada yalnız görsel karşılığı hesaplanır, veri değişmez.
   */
  function previewShift(index: number): { start: number; span: number } {
    const item = items[index]
    const start = weekIndex(firstStart, item.startDate)
    const span = Math.max(1, weekIndex(firstStart, item.endDate) - start + 1)
    if (!drag || drag.deltaWeeks === 0 || dragIndex === -1) return { start, span }

    if (drag.kind === 'move') {
      return index >= dragIndex
        ? { start: Math.max(0, start + drag.deltaWeeks), span }
        : { start, span }
    }

    if (index === dragIndex) return { start, span: Math.max(1, span + drag.deltaWeeks) }
    return index > dragIndex
      ? { start: Math.max(0, start + drag.deltaWeeks), span }
      : { start, span }
  }

  function beginDrag(event: React.PointerEvent, item: FlowItem, kind: DragKind) {
    if (!onChange || !item.id) return
    event.preventDefault()
    event.stopPropagation()
    setDrag({ itemId: item.id, kind, startX: event.clientX, deltaWeeks: 0 })
  }

  return (
    <div className={cn('overflow-x-auto rounded-xl border bg-card', className)}>
      <div ref={gridRef} className="min-w-[640px] p-4">
        {/* Ay başlıkları: hafta numarası tek başına bağlam vermiyordu —
            "12. hafta" hangi ay belli değildi. Tek haftalık artıklarda
            etiket yazılmaz, şerit okunmaz hâle gelmesin. */}
        <div
          className="mb-1 grid gap-px text-[10px] font-medium text-muted-foreground"
          style={{ gridTemplateColumns: gridColumns }}
        >
          <span />
          {monthSpans(firstStart, totalWeeks).map((month, i) => (
            <span
              key={`${month.label}-${i}`}
              style={{ gridColumn: `span ${month.span}` }}
              className="truncate border-b pb-0.5 text-center"
            >
              {month.span > 1 ? month.label : ''}
            </span>
          ))}
        </div>

        {/* Hafta numaraları: her 4 haftada bir — 40 haftalık akışta her
            haftayı yazmak okunmaz bir şerit üretiyor. */}
        <div
          className="mb-2 grid gap-px text-[10px] text-muted-foreground"
          style={{ gridTemplateColumns: gridColumns }}
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
            const status = statuses.get(flowItemKey(item, index)) ?? 'later'
            const { start, span } = previewShift(index)
            const selected = !!item.id && item.id === selectedId
            const draggable = !!onChange && !!item.id
            const dragging = drag?.itemId === item.id

            return (
              <div
                key={item.id ?? `yeni-${index}`}
                className="grid items-center gap-px"
                style={{ gridTemplateColumns: gridColumns }}
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

                {/* Blok kendi başlangıç sütununda başlar ve süresi kadar
                    sütun kaplar; boş sütunlar için hücre üretilmez. */}
                <div
                  style={{ gridColumn: `${start + 2} / span ${span}` }}
                  className={cn(
                    'relative h-5 rounded border',
                    BAR_STYLE[status],
                    selected && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
                    dragging && 'opacity-80'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect?.(item)}
                    onPointerDown={e => beginDrag(e, item, 'move')}
                    title={
                      `${item.name} · ${FLOW_STATUS_LABEL[status]}` +
                      (draggable ? ' · sürükleyerek taşıyın' : '')
                    }
                    className={cn(
                      'size-full rounded',
                      draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                    )}
                  >
                    <span className="sr-only">
                      {item.name} — {FLOW_STATUS_LABEL[status]}
                    </span>
                  </button>

                  {draggable && (
                    <span
                      role="presentation"
                      onPointerDown={e => beginDrag(e, item, 'resize')}
                      title="Sürükleyerek süreyi değiştirin"
                      className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r bg-foreground/20 hover:bg-foreground/40"
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {showMarker && (
            <span>
              Bu hafta: {currentWeek + 1}. hafta / {baseWeeks}
            </span>
          )}
          {drag && drag.deltaWeeks !== 0 ? (
            <span className="text-primary">
              {drag.kind === 'move' ? 'Taşınıyor' : 'Süre'}: {drag.deltaWeeks > 0 ? '+' : ''}
              {drag.deltaWeeks} hafta — devam blokları da kayıyor
            </span>
          ) : (
            !!onChange && (
              <span>Blokları sürükleyerek taşıyın, sağ kenardan süreyi değiştirin.</span>
            )
          )}
        </div>
      </div>
    </div>
  )
}
