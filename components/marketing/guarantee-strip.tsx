import { ShieldCheck, CreditCard, RotateCcw } from 'lucide-react'
import { TRIAL_DAYS } from '@/lib/plans'
import { cn } from '@/lib/utils'

// GÜVENCE ŞERİDİ — her CTA'nın altında aynı üç cümle.
//
// ============================================================
// NEDEN VAR
//
// Satın alma kararının önündeki üç endişe, CTA'ya BASILMADAN ÖNCE
// karşılanıyor:
//   "Denemek için kart vermem gerekiyor mu?" -> hayır
//   "Sonra kendiliğinden para gider mi?"     -> hayır, otomatik yenileme yok
//   "Beğenmezsem ne olur?"                   -> 14 gün koşulsuz iade
//
// 058'de otomatik tahsilat kaldırıldı; "deneme boyunca tahsilat yok"
// cümlesi de yerini "kart istemiyoruz"a bıraktı — artık deneme için
// gerçekten kart alınmıyor.
//
// TEK YERDE DURUYOR çünkü hero, fiyatlandırma ve kapanış CTA'sında aynı
// olmalı. Üç ayrı yerde elle yazılsaydı biri güncellenirken diğerleri
// bayatlar ve ürün kendi vaadi konusunda kendisiyle çelişirdi.
// ============================================================

const ITEMS = [
  { Icon: ShieldCheck, text: `${TRIAL_DAYS} gün ücretsiz — kredi kartı istemiyoruz` },
  { Icon: CreditCard, text: 'Tek çekim, otomatik yenileme yok' },
  // 14 gün, DENEME süresinden ayrı bir taahhüt: ödeme yapıldıktan
  // sonraki iade penceresi. İkisi karıştırılmamalı.
  { Icon: RotateCcw, text: 'Ödemede 14 gün koşulsuz iade' },
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
