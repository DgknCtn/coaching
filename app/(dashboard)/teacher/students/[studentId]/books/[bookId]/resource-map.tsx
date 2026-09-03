'use client'

import Link from 'next/link'
import { PenLine } from 'lucide-react'
import type { BookMapBook } from '@/lib/book-map'
import { BookMapGrid, BookMapLegend } from '@/components/shared/book-map-grid'
import { Button } from '@/components/ui/button'

// Kaynak Haritası — SALT GÖRÜNÜM (R7 / R6-03 güncellemesi).
//
// R6'da bu ekranda bir "Görünüm / Yönetim" modu vardı ve toplu işlemler
// buradan yapılıyordu. Fonksiyonel olarak yanlış değildi; ama aynı kitap
// verisi üzerinde İKİ ayrı çalışma bağlamı oluşuyordu: ödev planı buradaki
// haritada değil Haftalık Plan ekranındaydı.
//
// R7 kararı: tek Kitap Haritası. Ödev verme, ilerleme, onay ve geçmiş
// düzeltme aynı akademik verinin farklı işlemleridir ve tek yüzeyde birleşir
// (Haftalık Plan ekranı). Burası öğrencinin bu kitaptaki durumunu okumak
// için kalır; işlem yapmak isteyen öğretmen tek tıkla çalışma yüzeyine gider.
//
// Toplu işlem RPC'leri (map-actions.ts) SİLİNMEDİ — birleşik yüzey onları
// olduğu gibi çağırıyor.

interface Props {
  studentId: string
  book: BookMapBook
  /** Bölüm satırı menüsündeki "Aktif Tut" toggle'ının yönü (041 §6.5). */
  keepActiveTopicIds: string[]
}

export function ResourceMap({ studentId, book, keepActiveTopicIds }: Props) {
  // Sunucudan dizi gelir (Set serileştirilemez).
  const keepActiveTopicSet = new Set(keepActiveTopicIds)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BookMapLegend audience="teacher" book={book} />
        <Button
          size="sm"
          render={
            <Link
              href={`/teacher/students/${studentId}/homework/new?book=${book.bookId}`}
            />
          }
        >
          <PenLine />
          Bu kitapta çalış
        </Button>
      </div>

      {/* readOnly: hücre seçimi yok (ödev atama tek yüzeyde). Bölüm satırı
          menüsü ise konu bazlı olduğu için burada da çalışır. */}
      <BookMapGrid
        book={book}
        audience="teacher"
        readOnly
        studentId={studentId}
        keepActiveTopicIds={keepActiveTopicSet}
      />

      <p className="text-xs text-muted-foreground">
        Ödev verme, onaylama, tamamlandı işleme ve geri alma işlemleri tek
        Kitap Haritasında yapılır: <span className="font-medium">Bu kitapta çalış</span>.
      </p>
    </div>
  )
}
