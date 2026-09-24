'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

export function StudentUpdates({ updates }: { updates: StudentUpdate[] }) {
  if (updates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Bu hafta öğrencilerden gün notu gelmedi.
      </p>
    )
  }

  return (
    <ul className="divide-y">
      {updates.map(update => (
        <UpdateRow key={update.id} update={update} />
      ))}
    </ul>
  )
}

function UpdateRow({ update }: { update: StudentUpdate }) {
  const [isPending, startTransition] = useTransition()

  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <Link
            href={`/teacher/students/${update.studentId}`}
            className="hover:underline"
          >
            {update.studentName}
          </Link>
          <span className="text-xs font-normal text-muted-foreground">{update.when}</span>
          {!update.seen && <Badge variant="info">Yeni</Badge>}
        </p>
        {/* Öğrencinin kendi cümlesi — özetlenmez, kısaltılmaz. */}
        <p className="mt-0.5 text-sm text-muted-foreground">{update.text}</p>
      </div>

      {!update.seen && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
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
