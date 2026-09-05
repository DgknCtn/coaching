'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Partner kodu + paylaşılabilir bağlantıyı kopyalama.
 *
 * Kod tabloda zaten yazıyordu ama BAĞLANTI hiçbir yerde yoktu: partnere
 * kod göndermek, ona URL'i kendi elleriyle kurdurmak demekti — ve
 * `?ref=` biçimini yanlış yazan bir partnerin getirdiği müşteri hiç
 * kimseye yazılmazdı.
 *
 * Adres tarayıcıdan okunuyor (app/partner/referral-link.tsx ile aynı
 * gerekçe): NEXT_PUBLIC_APP_URL yanlış ayarlıysa çalışmayan bir
 * bağlantı paylaşılırdı, window.location.origin her zaman doğru.
 */
export function PartnerCodeCell({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')

  // İlk render'da boş; hidrasyondan sonra doluyor. Sunucu ve istemci
  // farklı değer üretmesin diye state üzerinden.
  if (typeof window !== 'undefined' && origin === '') {
    setOrigin(window.location.origin)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${origin}/?ref=${code}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Pano izni verilmemiş olabilir; kod zaten ekranda ve elle
      // seçilebilir. İşe yaramayan bir hata mesajı göstermek yerine
      // sessiz kalınıyor.
    }
  }

  return (
    <span className="flex items-center gap-1">
      <code className="text-xs">{code}</code>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        onClick={copy}
        aria-label={`${code} bağlantısını kopyala`}
        title="Partner bağlantısını kopyala"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </span>
  )
}
