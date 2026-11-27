import { Check, Clock, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CalendarBadges } from '@/components/sessions/calendar-badges'
import type { SessionRow } from '@/app/(dashboard)/teacher/students/[studentId]/gorusmeler/types'
import { DEMO_LESSONS, type DemoLesson } from '../demo/tour-fixtures'
import { BrowserWindow } from './browser-window'

// DERS & GÖRÜŞMELER + GOOGLE TAKVİM — satır rozetleri uygulamanın kendi
// CalendarBadges bileşeninden ("Calendar", "Katıl", "Calendar'da iptal
// edildi · sonuç seçin"). Örnek satırlar gerçek SessionRow tipinde.

function toRow(l: DemoLesson, i: number): SessionRow {
  const at = new Date().toISOString()
  return {
    id: `demo-lesson-${i}`,
    studentId: 'demo',
    studentName: l.student,
    serviceId: 'demo',
    plannedAt: at,
    currentPlannedAt: at,
    actualAt: null,
    durationMinutes: 60,
    unitCount: 1,
    status: l.state === 'done' ? 'yapildi' : 'planlandi',
    attended: null,
    note: null,
    cancelReason: null,
    groupSessionId: null,
    isMakeup: l.state === 'makeup',
    isExtra: false,
    source: l.fromCalendar ? 'calendar' : 'telafi',
    makeupDecision: null,
    makeupStatus: 'none',
    originPlannedAt: null,
    calendarState: l.state === 'calendar_cancelled' ? 'cancelled_in_calendar' : null,
    meetUrl: l.meet ? 'https://meet.google.com/' : null,
  }
}

function Outcome({ state }: { state: DemoLesson['state'] }) {
  if (state === 'done')
    return (
      <Badge variant="success">
        <Check className="size-3" />
        Yapıldı
      </Badge>
    )
  if (state === 'awaiting')
    return (
      <Badge variant="warning">
        <Clock className="size-3" />
        Sonuç bekliyor
      </Badge>
    )
  if (state === 'makeup')
    return (
      <Badge variant="info">
        <RotateCcw className="size-3" />
        Telafi
      </Badge>
    )
  if (state === 'planned') return <Badge variant="neutral">Planlandı</Badge>
  return null
}

export function LessonsMock() {
  return (
    <BrowserWindow
      title="Ders & Görüşmeler · bu hafta"
      label="Haftalık ders listesi: Google Takvim'den gelen dersler, Meet bağlantısı, takvimde iptal edilen ders için sonuç uyarısı ve telafi"
    >
      <ul className="divide-y text-sm">
        {DEMO_LESSONS.map((l, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
              {l.day} {l.time}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{l.student}</span>
              <span className="text-muted-foreground"> · {l.kind}</span>
              <span className="ml-2 inline-flex items-center gap-1.5">
                <CalendarBadges row={toRow(l, i)} />
              </span>
            </span>
            <Outcome state={l.state} />
          </li>
        ))}
      </ul>
      <p className="border-t bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        Saati geçen ders kendiliğinden &quot;Yapıldı&quot; sayılmaz; sonucu siz seçersiniz.
      </p>
    </BrowserWindow>
  )
}
