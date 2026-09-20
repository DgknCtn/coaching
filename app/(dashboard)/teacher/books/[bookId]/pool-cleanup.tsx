'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { archiveBookAction, deleteUnassignedBookAction } from '../actions'

// HAVUZ TEMİZLİĞİ (R7 Kaynak Mimarisi §7.3).
//
// TEK AYRIM NOKTASI: kaynak hiç kullanıldı mı?
//
//   hiç atanmamış  -> Sil. Yanlış girilmiş bir kayıt arşivde taşınmaz.
//   atanmış        -> Arşivle. Geçmiş kayıtlar bozulmamalı; arşivlenen
//                     kaynak yeni atama listesinde görünmez ama
//                     öğrencilerin ilerlemesi yerinde durur.
//
// Kullanıcıya İKİ DÜĞME GÖSTERİLMEZ: hangi fiilin doğru olduğuna veri
// karar verir, ekran yalnız onu sunar. Aksi hâlde "hangisini seçmeliyim?"
// sorusu her seferinde kullanıcıya kalırdı.
//
// İKİ ADIMLI: ikisi de geri alınamaz. Silme kaydı tamamen kaldırır,
// arşivleme kaynağı havuzdan düşürür.

export function PoolCleanup({
  bookId,
  bookTitle,
  assignmentCount,
}: {
  bookId: string
  bookTitle: string
  /** Her durumdaki atama sayısı — yalnız aktifler değil. */
  assignmentCount: number
}) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  const isAssigned = assignmentCount > 0

  function run() {
    startTransition(async () => {
      const res = isAssigned
        ? await archiveBookAction(bookId)
        : await deleteUnassignedBookAction(bookId)
      // Her iki aksiyon da başarıda /teacher/books'a yönlendirir; buraya
      // yalnız hata döndüğünde gelinir.
      if (res?.error) {
        toast.error(res.error)
        setConfirming(false)
      }
    })
  }

  return (
    <div className="mt-6 rounded-lg border border-destructive-border bg-destructive-subtle/40 p-4">
      <h2 className="text-sm font-medium">Havuz temizliği</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {isAssigned ? (
          <>
            Bu kaynak {assignmentCount} öğrenciye atanmış, bu yüzden silinemez.
            Arşivlenen kaynak yeni atama listesinde görünmez; geçmiş kayıtlar ve
            öğrenci ilerlemeleri korunur.
          </>
        ) : (
          <>
            Bu kaynak hiçbir öğrenciye atanmamış. Yanlış girilmiş bir kayıtsa
            kalıcı olarak silinebilir; bölümleri ve testleri de kaldırılır.
          </>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!confirming ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setConfirming(true)}
          >
            {isAssigned ? 'Arşivle' : 'Sil'}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={run}
            >
              {pending
                ? '…'
                : isAssigned
                ? `"${bookTitle}" arşivlensin`
                : `"${bookTitle}" kalıcı olarak silinsin`}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              Vazgeç
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
