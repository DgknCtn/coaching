'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarX2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { formatSessionDayDate } from '@/lib/service-structure'
import type { InboxEvent, InboxStudent } from '@/lib/calendar/session-links'
import { setCalendarMatchAction } from '@/app/(dashboard)/teacher/takvim-actions'

// EŞLEŞMEYEN CALENDAR ETKİNLİKLERİ — koç geneli liste (157).
//
// Katılımcısız ya da kimseye güvenle bağlanamayan etkinlikler burada
// toplanır. Başlıkta tek bir öğrencinin adı geçiyorsa o öğrenci ÖNERİ
// olarak seçili gelir; bağlama yine öğretmenin tıklamasıyla olur (belge:
// başlıktan sessiz tahmin yok). Seçim seriye bir kez kaydedilir, serinin
// sonraki tarihleri kendiliğinden gelir.

interface RowChoice {
  studentId: string
  serviceId: string
}

export function CalendarInbox({ events, students }: { events: InboxEvent[]; students: InboxStudent[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<string, RowChoice>>({})

  if (events.length === 0) return null
  const byId = new Map(students.map(s => [s.id, s]))

  function choiceFor(e: InboxEvent): RowChoice {
    const saved = choices[e.linkId]
    if (saved) return saved
    const studentId = e.suggestedStudentId ?? ''
    return { studentId, serviceId: byId.get(studentId)?.services[0]?.id ?? '' }
  }

  function setStudent(linkId: string, studentId: string) {
    setChoices(prev => ({ ...prev, [linkId]: { studentId, serviceId: byId.get(studentId)?.services[0]?.id ?? '' } }))
  }

  function apply(e: InboxEvent, ignored: boolean, wholeSeries: boolean) {
    const c = choiceFor(e)
    setBusyId(e.linkId)
    startTransition(async () => {
      const r = await setCalendarMatchAction({
        linkId: e.linkId,
        studentId: ignored ? null : c.studentId,
        serviceId: ignored ? null : c.serviceId,
        ignored,
        wholeSeries,
      })
      setBusyId(null)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(ignored ? 'Etkinlik yok sayıldı.' : `${byId.get(c.studentId)?.name ?? 'Öğrenci'} ile eşlendi.`)
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
            Bu etkinlikler hiçbir öğrenciye otomatik bağlanmadı. Başlıkta adı geçen öğrenci{' '}
            <span className="font-medium text-foreground">öneri</span> olarak seçili gelir; kontrol edip eşleyin. Ders
            değilse <span className="font-medium text-foreground">Yok say</span> deyin. Seçiminiz serinin sonraki
            tarihlerine de uygulanır.
          </p>
          <ul className="divide-y rounded-md border bg-card">
            {events.map(e => {
              const c = choiceFor(e)
              const student = byId.get(c.studentId)
              const services = student?.services ?? []
              const suggested = !!e.suggestedStudentId && c.studentId === e.suggestedStudentId
              const canMatch = !!student && !!c.serviceId
              return (
                <li key={e.linkId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.title ?? 'Başlıksız etkinlik'}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.startAt ? formatSessionDayDate(e.startAt, true) : '—'}
                      {e.recurring ? ' · tekrarlayan' : ''}
                      {e.attendees.length > 0 ? ` · ${e.attendees.join(', ')}` : ' · katılımcı yok'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <NativeSelect
                      aria-label="Öğrenci"
                      value={c.studentId}
                      onChange={ev => setStudent(e.linkId, ev.target.value)}
                    >
                      <option value="">Öğrenci seçin</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.id === e.suggestedStudentId ? ' (öneri)' : ''}
                        </option>
                      ))}
                    </NativeSelect>
                    {services.length > 1 && (
                      <NativeSelect
                        aria-label="Hizmet"
                        value={c.serviceId}
                        onChange={ev =>
                          setChoices(prev => ({ ...prev, [e.linkId]: { studentId: c.studentId, serviceId: ev.target.value } }))
                        }
                      >
                        {services.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </NativeSelect>
                    )}
                    {student && services.length === 0 && (
                      <span className="text-xs text-destructive">Birebir hizmeti yok</span>
                    )}
                    {suggested && <span className="text-[10px] text-muted-foreground">başlıktan öneri</span>}
                    <Button size="xs" disabled={isPending || !canMatch} onClick={() => apply(e, false, true)}>
                      {busyId === e.linkId ? <Loader2 className="animate-spin" /> : null}
                      {e.recurring ? 'Seriyi eşle' : 'Eşle'}
                    </Button>
                    {e.recurring && (
                      <Button size="xs" variant="outline" disabled={isPending || !canMatch} onClick={() => apply(e, false, false)}>
                        Yalnız bu tarih
                      </Button>
                    )}
                    <Button size="xs" variant="ghost" disabled={isPending} onClick={() => apply(e, true, true)}>
                      Yok say
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
