'use client'

import { Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmActionDialog } from '@/components/shared/confirm-action-dialog'
import { archiveStudentAction } from '../../actions'

// Öğrenciyi arşivle (M1.0-01 §1.1) — gerçek öğrenci için varsayılan,
// geri alınabilir işlem. Kalıcı silme burada YOK: yalnız arşiv listesinde,
// arşivdeki öğrenci için sunulur.

export function ArchiveStudentCard({
  studentId,
  fullName,
}: {
  studentId: string
  fullName: string
}) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Öğrenciyi arşivle</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Öğrenci Dashboard, Görevler, yaklaşan temaslar ve aktif listelerden çıkar. Ödevler,
        ilerleme ve görüşme geçmişi silinmez; Öğrenciler › Arşiv sekmesinden geri alınabilir.
      </p>
      <div className="mt-3">
        <ConfirmActionDialog
          trigger={
            <Button size="sm" variant="outline">
              <Archive />
              Arşivle
            </Button>
          }
          title={`${fullName} arşivlensin mi?`}
          description={
            <p>
              Öğrenci aktif operasyonlardan çıkar ve öğrenci koltuğu boşalır. Geçmiş kayıtlar
              korunur, istediğiniz zaman geri alabilirsiniz.
            </p>
          }
          confirmLabel="Arşivle"
          // Başarıda eylem arşiv listesine yönlendirir (redirect).
          onConfirm={() => archiveStudentAction(studentId)}
        />
      </div>
    </section>
  )
}
