'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { MessageSquarePlus, RotateCcw, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { HaftamCard, HaftamDay } from '@/lib/haftam'
import { shortDate } from './day-column'
import { WEEKDAY_SHORT_LABEL, type Weekday } from '@/lib/service-structure'
import {
  revertWorkItemsAction,
  setItemNoteAction,
  setPlanDatesAction,
  submitWorkItemsAction,
} from './actions'

// ÇALIŞMA KARTI (§5, §8, §9, §10, §11, §12).
//
// ============================================================
// MİNİMUM ALAN, MAKSİMUM AKADEMİK BAĞLAM
//
// Belgenin §5'i ve §21'i birlikte okunuyor: büyük kitap kapağı yok,
// büyük progress bar yok, satırlar varsayılan AÇIK, detay için her
// satırı tek tek açma gereği yok. Kart WhatsApp mesajı yoğunluğunda
// görünmeli — amaç tek bakışta mümkün olduğunca tüm haftayı okuyabilmek.
//
// ============================================================
// TİK = İŞİMİ BİTİRDİM
//
// Öğrenciye "onaya gönderildi / onay bekliyor / gönderim başarılı" gibi
// operasyon dili GÖSTERİLMEZ (§8). Arka planda mevcut onay akışı
// işliyor ama o sistemin işi. Öğrenci açısından cümle tek.
//
// Tek istisna öğretmen İADESİ (§11): orada öğrencinin yapması gereken
// yeni bir iş var, o yüzden görünür — ama "red/onay" diliyle değil,
// "tekrar bak" diye.


export function WorkCard({
  card,
  days,
  showDayPicker = true,
}: {
  card: HaftamCard
  days: HaftamDay[]
  showDayPicker?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [noteOpen, setNoteOpen] = useState(false)

  const ids = card.works.map(w => w.id)
  const currentDate = card.works[0]?.plannedForDate ?? ''
  // §12 not çalışma başına tutuluyor; kart tek bir çalışmaya denk
  // geldiğinde not alanı açılır. Çok kalemli kartta not, kartın ilk
  // kalemine değil TÜM kalemlerine yazılsaydı öğretmen aynı notu N kez
  // görürdü — o yüzden not yalnız tekil kartta sunuluyor.
  const singleWork = card.works.length === 1 ? card.works[0] : null

  function move(next: string) {
    const value = next === '' ? null : next
    startTransition(async () => {
      const res = await setPlanDatesAction(ids, value)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success(value ? 'Planına eklendi.' : 'Plandan çıkarıldı.')
    })
  }

  /**
   * Geri almanın GEÇİŞTEN BAĞIMSIZ hâli.
   *
   * Tik başarılı olduğunda sunucu yeniden doğrulaması bu kartı yeniden
   * oluşturuyor; toast ise ekranda kalmaya devam ediyor. Toast'un geri
   * çağrısı `startTransition`'a sarılı olduğunda, sökülmüş bir bileşenin
   * geçişine bağlı kalıyor ve HİÇ ÇALIŞMIYOR — düğme basılıyor, toast
   * kapanıyor, ama teslim geri alınmıyor. Sessiz başarısızlık, yanlış
   * tikini düzelttiğini sanan öğrenci için en kötü sonuç.
   *
   * Bu yüzden asıl iş sade bir async fonksiyonda; geçiş yalnız kartın
   * kendi düğmesinde (orada bekleme durumunu göstermek için gerekli).
   */
  async function runUndo() {
    const res = await revertWorkItemsAction(ids)
    if (res?.error) {
      toast.error(res.error)
      return
    }
    toast.success('Geri alındı.')
  }

  function complete() {
    startTransition(async () => {
      const res = await submitWorkItemsAction(ids)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      // GERİ AL TİKİN HEMEN YANINDA (§10): yanlış tik, öğrencinin
      // ekranda yapabileceği en kolay hata. Düzeltmesi de o kadar kolay
      // olmalı — ayrı bir ekrana gitmek gerekmemeli.
      toast.success(`${res.count ?? ids.length} çalışma tamamlandı.`, {
        action: {
          label: 'Geri al',
          onClick: () => {
            void runUndo()
          },
        },
      })
    })
  }

  function undo() {
    startTransition(runUndo)
  }

  return (
    <div
      // Sürükleme yalnız KOLAYLIK: aynı işi yapan menü aşağıda duruyor.
      // Onaylanmış kart sürüklenmez — bitmiş işi güne koymak anlamsız.
      draggable={!card.approved}
      onDragStart={e => {
        e.dataTransfer.setData('application/x-haftam-items', JSON.stringify(ids))
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn(
        'rounded-md border p-2 text-xs',
        card.submitted && 'bg-muted/40 opacity-70',
        !card.approved && 'cursor-grab active:cursor-grabbing'
      )}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={card.submitted}
          disabled={isPending || card.approved}
          onChange={e => (e.target.checked ? complete() : undo())}
          aria-label={`${card.bookTitle} ${card.unitLabel} tamamlandı`}
          className="mt-0.5 size-3.5 shrink-0 accent-primary"
        />

        <div className="min-w-0 flex-1">
          <p className={cn('font-medium leading-tight', card.submitted && 'line-through')}>
            {card.bookTitle}
          </p>
          {card.sectionTitle && (
            <p className="truncate text-[11px] text-muted-foreground">{card.sectionTitle}</p>
          )}
          <p className="text-[11px] text-muted-foreground">{card.unitLabel}</p>
        </div>
      </div>

      {/* ÖĞRETMEN İADESİ (§11) — "red" değil "tekrar bak". */}
      {card.hasReturned && (
        <div className="mt-1.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-1 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">Tekrar bak</p>
          {card.works.find(w => w.teacherNote)?.teacherNote && (
            <p className="mt-0.5">{card.works.find(w => w.teacherNote)!.teacherNote}</p>
          )}
        </div>
      )}

      {/* "Sonradan eklendi" bir SUÇLAMA DEĞİL bilgi: öğrencinin kurduğu
          plan bu işi içermiyordu. */}
      {card.lateAdded && !currentDate && (
        <Badge variant="neutral" className="mt-1.5">
          <Sparkles className="size-3" /> Hafta ortasında eklendi
        </Badge>
      )}

      {/* ÖĞRENCİNİN ÇALIŞMA NOTU (§12).
          "Öğretmene gönder" diye bir adım YOK: resmi çalışma alanına
          yazılmış olması zaten paylaşılmış olması demek. */}
      {singleWork && (
        <div className="mt-1.5">
          {singleWork.note && !noteOpen ? (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="w-full rounded bg-muted px-1.5 py-1 text-left text-[11px] italic text-muted-foreground"
            >
              {singleWork.note}
            </button>
          ) : noteOpen ? (
            <NoteEditor
              initial={singleWork.note ?? ''}
              onCancel={() => setNoteOpen(false)}
              onSave={text => {
                startTransition(async () => {
                  const res = await setItemNoteAction(singleWork.id, text)
                  if (res?.error) {
                    toast.error(res.error)
                    return
                  }
                  setNoteOpen(false)
                })
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <MessageSquarePlus className="size-3" /> Not
            </button>
          )}
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-1.5">
        {/* GÜNE TAŞI — ERİŞİLEBİLİR BİRİNCİL YOL.
            Sürüklemenin yapabildiği her şeyi klavyeyle de yapar. */}
        {showDayPicker && !card.approved && (
          <NativeSelect
            className="h-7 flex-1 text-[11px]"
            value={currentDate}
            disabled={isPending}
            aria-label={`${card.bookTitle} ${card.unitLabel} için gün seç`}
            onChange={e => move(e.target.value)}
          >
            <option value="">Planlanmadı</option>
            {days.map(day => (
              <option key={day.date} value={day.date}>
                {WEEKDAY_SHORT_LABEL[day.weekday as Weekday]} · {shortDate(day.date)}
              </option>
            ))}
          </NativeSelect>
        )}

        {/* ONAYLANMIŞ İŞ GERİ ALINAMAZ (097 / R7-06.04). Düğme yalnız
            öğrencinin kendi tikinde görünür. */}
        {card.submitted && !card.approved && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            disabled={isPending}
            onClick={undo}
          >
            <RotateCcw className="size-3" /> Geri al
          </Button>
        )}
      </div>
    </div>
  )
}

function NoteEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initial)

  return (
    <div className="space-y-1">
      <Textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={2}
        autoFocus
        placeholder="Bu çalışmayla ilgili notun…"
        className="text-[11px]"
        aria-label="Çalışma notu"
      />
      <div className="flex gap-1">
        <Button type="button" size="sm" className="h-6 px-2 text-[11px]" onClick={() => onSave(text)}>
          Kaydet
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          onClick={onCancel}
        >
          Vazgeç
        </Button>
      </div>
    </div>
  )
}
