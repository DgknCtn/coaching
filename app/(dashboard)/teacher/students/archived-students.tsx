'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmActionDialog } from '@/components/shared/confirm-action-dialog'
import { purgeStudentAction, restoreStudentAction } from './actions'

// Arşivdeki öğrenciler (M1.0-01 §1.1).
//
// Arşiv gerçek öğrenci için varsayılan güvenli işlemdir ve geri alınır.
// Kalıcı silme YALNIZ burada, arşivdeki öğrenci için ve adı birebir
// yazılarak sunulur — test öğrencilerini temizlemenin yolu.

export interface ArchivedStudent {
  id: string
  fullName: string
  detail: string
  archivedAt: string | null
}

const dateFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function ArchivedStudents({ students }: { students: ArchivedStudent[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  if (students.length === 0) {
    return (
      <EmptyState
        icon={Archive}
        title="Arşivde öğrenci yok"
        description="Arşivlenen öğrenciler burada görünür; geri alınabilir ya da test kaydıysa kalıcı silinebilir."
      />
    )
  }

  function restore(s: ArchivedStudent) {
    setBusyId(s.id)
    startTransition(async () => {
      const result = await restoreStudentAction(s.id)
      setBusyId(null)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success(`${s.fullName} aktif listeye geri alındı.`)
      router.refresh()
    })
  }

  return (
    <ul className="divide-y">
      {students.map(s => (
        <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-medium">{s.fullName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[s.detail, s.archivedAt ? `${dateFmt.format(new Date(s.archivedAt))} arşivlendi` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => restore(s)}
              disabled={busyId !== null}
            >
              {busyId === s.id ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Geri al
            </Button>
            <ConfirmActionDialog
              trigger={
                <Button size="sm" variant="ghost" className="text-destructive">
                  <Trash2 />
                  Kalıcı sil
                </Button>
              }
              title="Öğrenci kalıcı olarak silinsin mi?"
              description={
                <div className="space-y-2">
                  <p>
                    Bu işlem <strong>geri alınamaz</strong>. {s.fullName} için tüm ödevler,
                    ilerleme, görüşmeler, notlar ve finans kayıtları silinir.
                  </p>
                  <p>
                    Yalnız test öğrencileri için kullanın. Gerçek bir öğrenciyse arşivde
                    bırakmak yeterlidir; geçmişi korunur.
                  </p>
                </div>
              }
              confirmLabel="Kalıcı sil"
              destructive
              requireText={s.fullName}
              onConfirm={typed => purgeStudentAction(s.id, typed)}
              successMessage={`${s.fullName} kalıcı olarak silindi.`}
              onDone={() => router.refresh()}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
