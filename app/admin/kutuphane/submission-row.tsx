'use client'

// TEK KÜTÜPHANE ÖNERİSİ — karar satırı (069).
//
// RED GEREKÇESİ ZORUNLU DEĞİL AMA GÖRÜNÜR: koç kaynağını neden geri
// çevirdiğimizi görmeden düzeltemez, ama her reddi gerekçe yazmaya
// bağlamak da kararı geciktirir. Bu yüzden alan açıkta durur, boş
// bırakılabilir.
//
// ONAY GERİ ALINAMAZ BİR YAYINDIR: kütüphaneye kopya girer ve tüm koçlar
// görür. Bu yüzden onay düğmesi tek tıkla değil, onay adımıyla çalışır.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Loader2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  approveLibrarySubmissionAction,
  rejectLibrarySubmissionAction,
} from './actions'

export interface SubmissionRowProps {
  bookId: string
  title: string
  workspaceName: string
  submittedBy: string | null
  meta: string
  sectionCount: number
  unitCount: number
  unitLabel: string
  libraryStatus: string
  reviewNote: string | null
  /** "3 saat önce" — sunucuda biçimlenir. */
  updatedLabel: string
}

export function SubmissionRow(props: SubmissionRowProps) {
  const [confirming, setConfirming] = useState<'approve' | 'reject' | null>(null)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const decided = props.libraryStatus !== 'pending'

  function run(fn: () => Promise<{ error?: string }>, successText: string) {
    startTransition(async () => {
      const res = await fn()
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(successText)
      setConfirming(null)
      setReason('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{props.title}</p>
            {props.libraryStatus === 'approved' && <Badge variant="success">Yayında</Badge>}
            {props.libraryStatus === 'rejected' && <Badge variant="warning">Reddedildi</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{props.meta}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {props.workspaceName}
            {props.submittedBy ? ` · ${props.submittedBy}` : ''} · {props.updatedLabel}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {props.sectionCount} bölüm · {props.unitCount} {props.unitLabel}
          </p>
          {props.reviewNote && (
            <p className="mt-1 text-xs text-muted-foreground">Gerekçe: {props.reviewNote}</p>
          )}
        </div>

        {!decided && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirming(confirming === 'reject' ? null : 'reject')}
            >
              <X className="size-3.5" />
              Reddet
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => setConfirming(confirming === 'approve' ? null : 'approve')}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Check className="size-3.5" />}
              Onayla
            </Button>
          </div>
        )}
      </div>

      {confirming === 'approve' && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Kaynak kütüphaneye kopyalanacak ve tüm koçlara açılacak.
          </p>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => approveLibrarySubmissionAction(props.bookId),
                'Kaynak kütüphaneye eklendi.'
              )
            }
          >
            Onayla ve yayınla
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
            Vazgeç
          </Button>
        </div>
      )}

      {confirming === 'reject' && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <Input
            className="max-w-sm"
            placeholder="Gerekçe (koç görecek, isteğe bağlı)"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => rejectLibrarySubmissionAction(props.bookId, reason),
                'Öneri reddedildi.'
              )
            }
          >
            Reddet
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
            Vazgeç
          </Button>
        </div>
      )}
    </div>
  )
}
