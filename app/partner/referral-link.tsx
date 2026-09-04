'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// PAYLAŞILABİLİR BAĞLANTI.
//
// Kodu tek başına göstermek yetmez: partnerin yapacağı iş bir bağlantı
// paylaşmak, kod ezberletmek değil. Bağlantı kopyalanabilir olmalı ve
// kodun kendisi de görünmeli — telefonda söylenmesi gerekebilir.
//
// Adres tarayıcıdan okunuyor: sunucuda NEXT_PUBLIC_APP_URL kullanmak
// mümkündü ama ortam değişkeni yanlışsa partner çalışmayan bir bağlantı
// paylaşırdı. `window.location.origin` her zaman doğru.

export function ReferralLink({ code, rate }: { code: string; rate: number }) {
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')

  // İlk render'da boş; hidrasyondan sonra doluyor. Sunucu ve istemci
  // farklı değer üretmesin diye state üzerinden.
  if (typeof window !== 'undefined' && origin === '') {
    setOrigin(window.location.origin)
  }

  const link = `${origin}/?ref=${code}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Pano izni verilmemiş olabilir; bağlantı zaten ekranda ve elle
      // seçilebilir. Sessiz kalmak, işe yaramayan bir hata mesajı
      // göstermekten iyi.
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Partner bağlantınız</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {link}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={copy} className="gap-1.5">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Kodunuz: <strong className="font-medium text-foreground">{code}</strong> ·
          Komisyon oranınız:{' '}
          <strong className="font-medium text-foreground">%{Math.round(rate * 100)}</strong>
        </p>
        <p className="text-xs text-muted-foreground">
          Bu bağlantıdan gelen ziyaretçi 30 gün içinde kaydolursa size yazılır.
          Getirdiğiniz müşterinin <strong>her</strong> lisans alımından komisyon
          kazanırsınız.
        </p>
      </CardContent>
    </Card>
  )
}
