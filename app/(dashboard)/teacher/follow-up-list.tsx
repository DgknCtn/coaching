'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check, MessageCircle, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { Initial } from './student-updates'
import { buildFollowUpMessage } from '@/lib/share-text'

// TAKİP GEREKENLER (R8 §17B, §19).
//
// ============================================================
// BU LİSTE "EN GERİDEKİLER" DEĞİL
//
// §18'in ayrımı: *"Müdahale Gerekli yalnız 'çok geride' demek değildir.
// Aynı zamanda öğrencinin durumu hakkında yeterli görünürlük yok ve
// öğretmenin temas etmesi gerekiyor."*
//
// Bu yüzden liste yüzdeye göre değil, SON GERÇEK ÇALIŞMA HAREKETİNE
// göre kurulur. Yüzdesi iyi görünen ama dört gündür ortada olmayan
// öğrenci buraya düşer; yüzdesi düşük ama her gün teslim yapan öğrenci
// düşmez — o zaten tablodaki durum rozetiyle görünür.
//
// ============================================================
// NEDEN OTOMATİK MESAJ YOK
//
// §19: ilk sürümde sistem otomatik mesaj göndermek zorunda değildir.
// Hazır metin üretilir, öğretmen kopyalar. WhatsApp konuşması akademik
// veri modelinin yerine geçmez; burada tutulan tek şey öğretmenin ne
// zaman temas ettiğini kendi görebilmesi.

export interface FollowUpStudent {
  id: string
  name: string
  /** "4 gündür çalışma hareketi yok" — sunucuda hesaplanır. */
  silenceLabel: string
  /** "Son teslim: 18 Eylül" gibi kısa bağlam satırları. */
  facts: string[]
}

export function FollowUpList({ students }: { students: FollowUpStudent[] }) {
  if (students.length === 0) {
    return (
      <EmptyState
        icon={UserCheck}
        title="Takip gerektiren öğrenci yok"
        description="Uzun süre çalışma hareketi olmayan öğrenci olduğunda burada görünür."
        className="py-10"
      />
    )
  }

  // Sıra sunucudan geliyor: en uzun sessizlik en üstte.
  return (
    <ul className="divide-y">
      {students.map(student => (
        <FollowUpRow key={student.id} student={student} />
      ))}
    </ul>
  )
}

function FollowUpRow({ student }: { student: FollowUpStudent }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildFollowUpMessage(student.name))
      setCopied(true)
      // Onay kalıcı değil: aynı düğmeyle ikinci kez kopyalanabildiği
      // anlaşılsın diye birkaç saniye sonra eski hâline döner.
      setTimeout(() => setCopied(false), 2000)
      toast.success('Mesaj kopyalandı. WhatsApp grubundan gönderebilirsin.')
    } catch {
      // Pano izni yoksa sessizce başarısız olmak yerine söylüyoruz:
      // öğretmen mesajın kopyalandığını sanıp boş yapıştırmamalı.
      toast.error('Kopyalanamadı. Metni elle yazman gerekebilir.')
    }
  }

  return (
    <li className="flex flex-wrap items-start gap-3 py-3 first:pt-1 last:pb-1">
      <Initial name={student.name} />

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Link
            href={`/teacher/students/${student.id}`}
            className="font-medium hover:underline"
          >
            {student.name}
          </Link>
          <Badge variant="warning">{student.silenceLabel}</Badge>
        </p>
        {/* Olgular ayrı etiketler: " · " ile birleşik tek satır dar
            ekranda kırılıp hangi bilginin hangisi olduğu kayboluyordu. */}
        <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Son durum">
          {student.facts.map(fact => (
            <li
              key={fact}
              className="rounded-md border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground"
            >
              {fact}
            </li>
          ))}
        </ul>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 max-sm:ml-11"
        onClick={copy}
        aria-label={`${student.name} için WhatsApp mesajını kopyala`}
      >
        {copied ? <Check className="size-3.5" /> : <MessageCircle className="size-3.5" />}
        {copied ? 'Kopyalandı' : 'Mesajı kopyala'}
      </Button>
    </li>
  )
}
