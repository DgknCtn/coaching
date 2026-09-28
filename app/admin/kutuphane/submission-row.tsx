'use client'

// TEK KÜTÜPHANE ÖNERİSİ — karar satırı (069).
//
// RED GEREKÇESİ ZORUNLU DEĞİL AMA GÖRÜNÜR: koç kaynağını neden geri
// çevirdiğimizi görmeden düzeltemez, ama her reddi gerekçe yazmaya
// bağlamak da kararı geciktirir. Bu yüzden alan açıkta durur, boş
// bırakılabilir.
//
// ONAY GERİ ALINAMAZ BİR YAYINDIR: kütüphaneye kopya girer ve tüm koçlar
// görür. Bu yüzden onay düğmesi tek tıkla değil, onay diyaloğuyla çalışır.
//
// İKİ AYRI METİN (129): koça giden not (isteğe bağlı, koç görür) ve
// yönetim kaydına giden gerekçe (zorunlu, yalnız yöneticiler görür).

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionDialog } from '@/components/admin/action-dialog'
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
  const [note, setNote] = useState('')

  const decided = props.libraryStatus !== 'pending'

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
            <ActionDialog
              triggerLabel="Reddet"
              title="Öneriyi reddet"
              description="Kaynak kütüphaneye girmez; koç reddedildiğini görür."
              submitLabel="Reddet"
              successMessage="Öneri reddedildi."
              preview={
                <p>
                  {props.title}: <span className="text-muted-foreground">değerlendirmede</span> →{' '}
                  <span className="font-medium">reddedildi</span>
                </p>
              }
              onOpenChange={(open) => open && setNote('')}
              onSubmit={(reason) => rejectLibrarySubmissionAction(props.bookId, note, reason)}
            >
              <div className="space-y-1.5">
                <Label htmlFor={`note-${props.bookId}`}>Koça not (isteğe bağlı)</Label>
                <Input
                  id={`note-${props.bookId}`}
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Koç bu notu görür"
                />
              </div>
            </ActionDialog>
            <ActionDialog
              triggerLabel="Onayla"
              title="Kütüphaneye yayınla"
              description="Kaynak kütüphaneye kopyalanır ve tüm koçlara açılır. Geri alınamaz."
              submitLabel="Onayla ve yayınla"
              successMessage="Kaynak kütüphaneye eklendi."
              preview={
                <p>
                  {props.title}: <span className="text-muted-foreground">değerlendirmede</span> →{' '}
                  <span className="font-medium">yayında</span>
                </p>
              }
              onSubmit={(reason) => approveLibrarySubmissionAction(props.bookId, reason)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
