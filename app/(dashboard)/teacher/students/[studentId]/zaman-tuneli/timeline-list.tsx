'use client'

import { useState } from 'react'
import { BookOpenCheck, CalendarCheck, MessageSquare, StickyNote, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  TIMELINE_CATEGORY_LABEL,
  groupByDay,
  type TimelineCategory,
  type TimelineEvent,
} from '@/lib/activity-timeline'

// Zaman tüneli listesi + kategori süzgeci (PRD 10.1 filtreleri).

const ICON: Record<TimelineCategory, typeof StickyNote> = {
  akademik: BookOpenCheck,
  ders: CalendarCheck,
  gorusme: MessageSquare,
  odeme: Wallet,
  not: StickyNote,
}

const dayFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })

export function TimelineList({ events, categories }: { events: TimelineEvent[]; categories: TimelineCategory[] }) {
  const [active, setActive] = useState<Set<TimelineCategory>>(new Set(categories))
  const shown = events.filter(e => active.has(e.category))
  const days = groupByDay(shown)
  const counts = new Map<TimelineCategory, number>()
  for (const e of events) counts.set(e.category, (counts.get(e.category) ?? 0) + 1)

  function toggle(c: TimelineCategory) {
    setActive(prev => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div role="group" aria-label="Kategoriye göre süz" className="flex flex-wrap gap-1.5">
        {categories.map(c => {
          const Icon = ICON[c]
          const on = active.has(c)
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(c)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary',
                on ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <Icon className="size-3.5" />
              {TIMELINE_CATEGORY_LABEL[c]}
              <span className="tabular-nums text-muted-foreground">{counts.get(c) ?? 0}</span>
            </button>
          )
        })}
      </div>

      {days.length === 0 ? (
        <p className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Seçili kategorilerde bu dönemde kayıt yok.
        </p>
      ) : (
        <ol className="space-y-6">
          {days.map(d => (
            <li key={d.day}>
              <h2 className="sticky top-0 z-10 bg-background/95 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                {dayFmt.format(new Date(`${d.day}T12:00:00`))}
              </h2>
              <ul className="mt-2 space-y-2 border-l pl-4">
                {d.events.map(e => {
                  const Icon = ICON[e.category]
                  return (
                    <li key={e.key} className="relative">
                      <span className="absolute -left-[1.4rem] top-1 flex size-5 items-center justify-center rounded-full border bg-card text-muted-foreground">
                        <Icon className="size-3" />
                      </span>
                      <p className="text-sm">
                        <span className="font-medium">{e.title}</span>
                        {e.kind !== 'payment' && !e.at.endsWith('T23:59:00') && (
                          <span className="ml-2 text-xs tabular-nums text-muted-foreground">{timeFmt.format(new Date(e.at))}</span>
                        )}
                      </p>
                      {e.detail && <p className="mt-0.5 text-xs text-muted-foreground">{e.detail}</p>}
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
