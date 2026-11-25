'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarDays, Loader2, RefreshCw, Unplug } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatSessionLong } from '@/lib/service-structure'
import {
  disconnectCalendarAction,
  listGoogleCalendarsAction,
  setCalendarIdsAction,
  syncCalendarNowAction,
} from '../takvim-actions'

// GOOGLE TAKVİMİ — Ayarlar kartı (migration 157).
//
// Yalnız OKUMA: İz Calendar'a hiç yazmaz. Calendar planlanan zamanın
// kaynağı, İz gerçekleşen hizmetin kaydı. Saati geçen ders kendiliğinden
// "Yapıldı" sayılmaz.

const RESULT_TEXT: Record<string, string> = {
  baglandi: 'Google Takvimi bağlandı.',
  iptal: 'Bağlantı iptal edildi.',
  gecersiz: 'Bağlantı isteği doğrulanamadı; tekrar deneyin.',
  anahtar_yok: 'Google kalıcı erişim vermedi; tekrar bağlanıp izinleri onaylayın.',
  kayit: 'Bağlantı kaydedilemedi.',
  hata: 'Google ile bağlantı kurulamadı.',
  yapilandirilmadi: 'Google Calendar entegrasyonu henüz yapılandırılmadı.',
}

export interface CalendarConnectionView {
  googleEmail: string | null
  status: 'active' | 'needs_reauth' | 'revoked'
  calendarIds: string[]
  lastSyncedAt: string | null
  lastError: string | null
}

export function CalendarCard({
  connection,
  result,
}: {
  connection: CalendarConnectionView | null
  result: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [calendars, setCalendars] = useState<{ id: string; summary: string; primary: boolean }[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set(connection?.calendarIds ?? ['primary']))
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  function syncNow() {
    startTransition(async () => {
      const r = await syncCalendarNowAction()
      if (r.error) toast.error(r.error)
      else if (r.summary) {
        const s = r.summary
        toast.success(
          `${s.events} etkinlik okundu · ${s.created + s.adopted} oturum bağlandı${s.moved ? ` · ${s.moved} taşındı` : ''}${
            s.unmatched ? ` · ${s.unmatched} eşleşmeyen` : ''
          }`
        )
      }
      router.refresh()
    })
  }

  function loadCalendars() {
    startTransition(async () => {
      const r = await listGoogleCalendarsAction()
      if (r.error) toast.error(r.error)
      else setCalendars(r.calendars ?? [])
    })
  }

  function saveCalendars() {
    startTransition(async () => {
      const r = await setCalendarIdsAction([...picked])
      if (r.error) toast.error(r.error)
      else {
        toast.success('Takvim seçimi kaydedildi.')
        setCalendars(null)
        router.refresh()
      }
    })
  }

  function disconnect() {
    startTransition(async () => {
      const r = await disconnectCalendarAction()
      if (r.error) toast.error(r.error)
      else toast.success('Bağlantı koparıldı; İz\'deki oturumlar korunuyor.')
      setConfirmDisconnect(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 text-sm">
      {result && RESULT_TEXT[result] && (
        <p className={result === 'baglandi' ? 'text-success' : 'text-destructive'}>{RESULT_TEXT[result]}</p>
      )}

      {!connection ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 text-muted-foreground">
            Derslerinizi Google Takvim&apos;de planlayın; öğrenciyle eşleşen dersler Ders &amp; Görüşmeler&apos;e
            kendiliğinden gelir. İz takviminize yazmaz, yalnız okur.
          </p>
          {/* Dosya/OAuth uçuna tam sayfa gidiş: istemci tarafı gezinme değil. */}
          <Button size="sm" render={<a href="/api/google/calendar/connect" />}>
            <CalendarDays className="size-3.5" />
            Google Takvimi bağla
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{connection.googleEmail ?? 'Google hesabı'}</span>
            {connection.status === 'active' ? (
              <Badge variant="success">Bağlı</Badge>
            ) : (
              <Badge variant="warning">Yeniden bağlanın</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {connection.lastSyncedAt ? `Son eşitleme ${formatSessionLong(connection.lastSyncedAt)}` : 'Henüz eşitlenmedi'}
            </span>
          </div>
          {connection.lastError && <p className="text-xs text-destructive">Son hata: {connection.lastError}</p>}

          <div className="flex flex-wrap gap-2">
            {connection.status === 'active' ? (
              <Button size="sm" variant="outline" disabled={isPending} onClick={syncNow}>
                {isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Şimdi eşitle
              </Button>
            ) : (
              <Button size="sm" render={<a href="/api/google/calendar/connect" />}>
                <CalendarDays className="size-3.5" />
                Yeniden bağlan
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={isPending} onClick={loadCalendars}>
              Takvimleri seç ({connection.calendarIds.length})
            </Button>
            {confirmDisconnect ? (
              <span className="flex items-center gap-2 text-xs">
                Anahtar silinir; İz&apos;deki oturumlar kalır.
                <Button size="sm" variant="destructive" disabled={isPending} onClick={disconnect}>
                  Bağlantıyı kopar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(false)}>
                  Vazgeç
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnect(true)}>
                <Unplug />
                Bağlantıyı kopar
              </Button>
            )}
          </div>

          {calendars && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Derslerin bulunduğu takvimleri seçin (en fazla 10).</p>
              {calendars.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={picked.has(c.id)}
                    onChange={() =>
                      setPicked(prev => {
                        const next = new Set(prev)
                        if (next.has(c.id)) next.delete(c.id)
                        else next.add(c.id)
                        return next
                      })
                    }
                  />
                  {c.summary}
                  {c.primary && <span className="text-muted-foreground"> (birincil)</span>}
                </label>
              ))}
              <Button size="sm" disabled={isPending || picked.size === 0} onClick={saveCalendars}>
                Kaydet
              </Button>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Calendar&apos;daki dersin saati geçse de İz onu kendiliğinden &quot;Yapıldı&quot; saymaz; sonucu siz
            girersiniz. Google uygulaması doğrulanana kadar bağlantı 7 günde bir yenilenmelidir.
          </p>
        </>
      )}
    </div>
  )
}
