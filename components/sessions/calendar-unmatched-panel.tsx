'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarX2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { formatSessionDayDate } from '@/lib/service-structure'
import type { UnmatchedCalendarEvent } from '@/lib/calendar/session-links'
import { setCalendarMatchAction } from '@/app/(dashboard)/teacher/takvim-actions'

// EŞLEŞMEYEN CALENDAR ETKİNLİKLERİ (157).
//
// Belgenin kuralı: güvenli eşleşme yoksa sessiz tahmin yok, öğretmenden
// BİR KEZ seçim. Bu kutu öğrencinin Ders & Görüşmeler sayfasında durur:
// öğretmen etkinliği BU öğrencinin bir hizmetiyle eşler ya da yok sayar.
// Seçim varsayılan olarak serinin tüm tarihlerine uygulanır.

export function CalendarUnmatchedPanel({
  studentId,
  studentName,
  events,
  services,
}: {
  studentId: string
  studentName: string
  events: UnmatchedCalendarEvent[]
  /** Bu öğrencinin aktif birebir hizmetleri. */
  services: { id: string; label: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(true)
  const [serviceByLink, setServiceByLink] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  if (events.length === 0) return null

  function apply(linkId: string, ignored: boolean, wholeSeries: boolean) {
    const serviceId = serviceByLink[linkId] ?? services[0]?.id ?? null
    setBusyId(linkId)
    startTransition(async () => {
      const r = await setCalendarMatchAction({
        linkId,
        studentId: ignored ? null : studentId,
        serviceId: ignored ? null : serviceId,
        ignored,
        wholeSeries,
      })
      setBusyId(null)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(ignored ? 'Etkinlik yok sayıldı.' : `${studentName} ile eşlendi.`)
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-warning-border bg-warning-subtle/40 px-4 py-3 text-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-medium">
          <CalendarX2 className="size-4" />
          Google Takvim&apos;de eşleşmeyen etkinlikler ({events.length})
        </span>
        <span className="text-xs text-muted-foreground">{open ? 'Gizle' : 'Göster'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Bu öğrencinin (ya da velisinin) davetli olduğu ama otomatik bağlanamayan dersler ile katılımcısız
            etkinlikler. Otomatik bağlama için öğrencinin <strong>tek</strong> aktif birebir hizmeti olmalı;
            birden çoksa hangisine yazılacağını burada bir kez seçersiniz.
          </p>
          {services.length === 0 && (
            <p className="text-xs font-medium text-destructive">
              Bu öğrencinin aktif birebir hizmeti yok. Önce Hizmet Yapısı&apos;ndan birebir ders ya da koçluk
              ekleyin; sonra buradan eşleyebilirsiniz.
            </p>
          )}
          <ul className="divide-y rounded-md border bg-card">
            {events.map(e => (
              <li key={e.linkId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.title ?? 'Başlıksız etkinlik'}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.startAt ? formatSessionDayDate(e.startAt, true) : '—'}
                    {e.recurring ? ' · tekrarlayan' : ''}
                    {e.attendees.length > 0 ? ` · ${e.attendees.join(', ')}` : ' · katılımcı yok'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {services.length > 1 && (
                    <NativeSelect
                      aria-label="Hizmet"
                      value={serviceByLink[e.linkId] ?? services[0].id}
                      onChange={ev => setServiceByLink(prev => ({ ...prev, [e.linkId]: ev.target.value }))}
                    >
                      {services.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                  <Button
                    size="xs"
                    disabled={isPending || services.length === 0}
                    onClick={() => apply(e.linkId, false, true)}
                    title={services.length === 0 ? 'Bu öğrencinin aktif birebir hizmeti yok' : undefined}
                  >
                    {busyId === e.linkId ? <Loader2 className="animate-spin" /> : null}
                    {e.recurring ? 'Seriyi bu öğrenciyle eşle' : 'Bu öğrenciyle eşle'}
                  </Button>
                  {e.recurring && (
                    <Button size="xs" variant="outline" disabled={isPending || services.length === 0} onClick={() => apply(e.linkId, false, false)}>
                      Yalnız bu tarih
                    </Button>
                  )}
                  <Button size="xs" variant="ghost" disabled={isPending} onClick={() => apply(e.linkId, true, true)}>
                    Yok say
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
