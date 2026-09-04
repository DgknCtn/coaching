import { ShieldCheck, CreditCard, RotateCcw } from 'lucide-react'
import { TRIAL_DAYS } from '@/lib/plans'
import { cn } from '@/lib/utils'

// GÜVENCE ŞERİDİ — her CTA'nın altında aynı üç cümle.
//
// ============================================================
// NEDEN VAR
//
// Kayıtta kart isteniyor. Bu, dönüşümün önündeki en büyük yeni engel ve
// saklanırsa kayıp EN PAHALI yerde yaşanır: kullanıcı kaydolur, kart
// ekranını görür, şaşırır ve çıkar. O noktada onu geri getirmek için
// hiçbir şeyimiz yoktur.
//
// Bu yüzden itiraz, CTA'ya BASILMADAN ÖNCE karşılanıyor. Üç cümle,
// kullanıcının aklına gelen üç soruya birebir denk geliyor:
//   "Şimdi para gidecek mi?"  -> deneme boyunca tahsilat yok
//   "Ne zaman gidecek?"       -> N gün sonra, hatırlatmayla
//   "Beğenmezsem ne olur?"    -> tek tıkla iptal + koşulsuz iade
//
// TEK YERDE DURUYOR çünkü hero, fiyatlandırma ve kapanış CTA'sında aynı
// olmalı. Üç ayrı yerde elle yazılsaydı biri güncellenirken diğerleri
// bayatlar ve ürün kendi vaadi konusunda kendisiyle çelişirdi.
// ============================================================

const ITEMS = [
  { Icon: ShieldCheck, text: `${TRIAL_DAYS} gün ücretsiz — deneme boyunca tahsilat yok` },
  { Icon: CreditCard, text: 'Dilediğiniz an tek tıkla iptal' },
  { Icon: RotateCcw, text: 'İlk ödemede 14 gün koşulsuz iade' },
]

export function GuaranteeStrip({
  className,
  align = 'center',
}: {
  className?: string
  align?: 'center' | 'start'
}) {
  return (
    <ul
      className={cn(
        'flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground',
        align === 'center' ? 'justify-center' : 'justify-start',
        className
      )}
    >
      {ITEMS.map(({ Icon, text }) => (
        <li key={text} className="flex items-center gap-1.5">
          <Icon className="size-3.5 shrink-0 text-success-foreground" />
          {text}
        </li>
      ))}
    </ul>
  )
}
