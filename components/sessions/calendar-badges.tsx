import { CalendarDays, Video } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { SessionRow } from '@/app/(dashboard)/teacher/students/[studentId]/gorusmeler/types'

// CALENDAR GÖSTERGELERİ (157) — ay ve hafta satırlarında ortak.
//
//   "Calendar" rozeti: oturum Google Calendar'dan planlandı.
//   "Katıl": etkinlikteki Meet bağlantısı (yalnız okunur; yeni Meet yok).
//   Uyarı: Calendar'da iptal edildi / karşılığı yok → oturum SİLİNMEDİ,
//   öğretmenden sonuç bekler. Saati geçen ders kendiliğinden "Yapıldı" olmaz.

export function CalendarBadges({ row }: { row: SessionRow }) {
  if (row.source !== 'calendar' && !row.calendarState) return null
  const open = row.status === 'planlandi'
  return (
    <>
      {row.source === 'calendar' && (
        <span
          className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
          title="Google Calendar'dan planlandı"
        >
          <CalendarDays className="size-3" />
          Calendar
        </span>
      )}
      {open && row.meetUrl && (
        <a
          href={row.meetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary underline-offset-2 hover:underline"
        >
          <Video className="size-3" />
          Katıl
        </a>
      )}
      {open && row.calendarState && (
        <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
          {row.calendarState === 'cancelled_in_calendar'
            ? "Calendar'da iptal edildi · sonuç seçin"
            : "Calendar'da karşılığı yok · sonuç seçin"}
        </Badge>
      )}
    </>
  )
}
