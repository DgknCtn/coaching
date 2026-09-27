'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check, NotebookPen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { cn } from '@/lib/utils'
import { markDayNoteSeenAction } from './actions'

// ÖĞRENCİ GÜNCELLEMELERİ (R8 §17A).
//
// ============================================================
// BU AKIŞ BİR BİLDİRİM KUTUSU DEĞİL
//
// Belge §21'de "her öğrenci hareketi öğretmene bildirim olarak
// gönderilmeyecek" diyor. Burada tiklenen çalışmalar YOK, planlama
// hareketleri YOK — yalnız öğrencinin KENDİ YAZDIĞI gün notları var.
//
// Sebep §16'da: notun değeri bağlam. "Hastayım, bugün çalışamadım"
// cümlesi öğretmenin o öğrenciyi yanlış okumasını engeller. Teslim
// sayısı bunu söyleyemez.
//
// "Görüldü" işareti listeyi temizlemek içindir, bir görev değil:
// öğretmen okumadığı için hiçbir şey bozulmaz.

export interface StudentUpdate {
  id: string
  studentId: string
  studentName: string
  /** "Salı 20:14" — sunucuda biçimlendirilir (saat dilimi orada doğru). */
  when: string
  text: string
  seen: boolean
}

/** Liste ilk açılışta bu kadar satır gösterir; kalanı tek tıkla açılır. */
const INITIAL_VISIBLE = 5

export function StudentUpdates({ updates }: { updates: StudentUpdate[] }) {
  const [showAll, setShowAll] = useState(false)

  if (updates.length === 0) {
    return (
      <EmptyState
        icon={NotebookPen}
        title="Yeni gün notu yok"
        description="Öğrenciler Haftam'da gün notu yazdığında burada görünür."
        className="py-10"
      />
    )
  }

  const visible = showAll ? updates : updates.slice(0, INITIAL_VISIBLE)
  const hidden = updates.length - visible.length

  return (
    <div>
      <ul className="divide-y">
        {visible.map(update => (
          <UpdateRow key={update.id} update={update} />
        ))}
      </ul>
      {hidden > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => setShowAll(true)}
        >
          Tümünü göster ({updates.length})
        </Button>
      )}
    </div>
  )
}

function UpdateRow({ update }: { update: StudentUpdate }) {
  const [isPending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState(false)
  // Kısa notlarda "devamı" bağlantısı gürültü olurdu; eşik kabaca üç satır.
  const long = update.text.length > 180

  return (
    <li
      className={cn(
        // GÖRÜLMEMİŞ SATIR SOL KENARDA İNCE BİR ÇİZGİYLE AYRILIR: rozet tek
        // başına listenin ortasında kayboluyordu.
        'flex items-start gap-3 border-l-2 py-3 pl-3 first:pt-1 last:pb-1',
        update.seen ? 'border-transparent' : 'border-info'
      )}
    >
      <Initial name={update.studentName} />

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <Link
            href={`/teacher/students/${update.studentId}`}
            className="font-medium hover:underline"
          >
            {update.studentName}
          </Link>
          <span className="text-xs text-muted-foreground">{update.when}</span>
          {!update.seen && <Badge variant="info">Yeni</Badge>}
        </p>
        {/* Öğrencinin kendi cümlesi — özetlenmez. Uzunsa kısaltılmış
            gösterilir ama tek tıkla tamamı açılır; kelimesi değiştirilmez. */}
        <p
          className={cn(
            'mt-1 whitespace-pre-line text-sm text-foreground/80',
            long && !expanded && 'line-clamp-3'
          )}
        >
          {update.text}
        </p>
        {long && (
          <button
            type="button"
            className="mt-0.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            aria-expanded={expanded}
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? 'Daha az göster' : 'Devamını oku'}
          </button>
        )}
      </div>

      {!update.seen && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={isPending}
          aria-label={`${update.studentName} notunu görüldü olarak işaretle`}
          onClick={() =>
            startTransition(async () => {
              const res = await markDayNoteSeenAction(update.id)
              if (res?.error) toast.error(res.error)
            })
          }
        >
          <Check className="size-3.5" /> Gördüm
        </Button>
      )}
    </li>
  )
}

/** Öğrenci adının baş harfi — satırları göz ucuyla ayırmak için. */
export function Initial({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
    >
      {name.trim().charAt(0).toLocaleUpperCase('tr') || '?'}
    </span>
  )
}
