'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Copy, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
      <p className="text-sm text-muted-foreground">
        Şu an takip gerektiren öğrenci yok.
      </p>
    )
  }

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
      toast.success('Mesaj kopyalandı. WhatsApp grubundan gönderebilirsin.')
    } catch {
      // Pano izni yoksa sessizce başarısız olmak yerine söylüyoruz:
      // öğretmen mesajın kopyalandığını sanıp boş yapıştırmamalı.
      toast.error('Kopyalanamadı. Metni elle yazman gerekebilir.')
    }
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <Link href={`/teacher/students/${student.id}`} className="hover:underline">
            {student.name}
          </Link>
          <Badge variant="warning">{student.silenceLabel}</Badge>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{student.facts.join(' · ')}</p>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={copy}>
        {copied ? <Copy className="size-3.5" /> : <MessageCircle className="size-3.5" />}
        WhatsApp mesajını kopyala
      </Button>
    </li>
  )
}
