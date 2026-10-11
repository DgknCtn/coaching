import { ArrowRight } from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { SectionHeading } from './section-heading'

// SORUN → ÇÖZÜM.
//
// ============================================================
// NEDEN EŞLEŞTİRİLMİŞ SATIRLAR
//
// Önceden iki ayrı liste vardı ("önce" ve "sonra"); okuyucu hangi
// cevabın hangi soruna karşılık geldiğini kendisi eşleştirmek zorundaydı.
// Artık her satır bir acı ve onu kaldıran TEK özellik.
//
// Soldaki maddelerin hepsi öğretmenin bugün gerçekten yaşadığı şeyler;
// sağdakilerin hepsi ürünün bugün gerçekten yaptıkları. Gelecekte
// yapılacak bir şey anlatılmıyor.
// ============================================================

const PAIRS: { pain: string; fix: string }[] = [
  {
    pain: "Ödevler WhatsApp'ta kayboluyor",
    fix: 'Ödev öğrencinin panelinde durur; hazır mesajı tek dokunuşla WhatsApp’a kopyalarsınız.',
  },
  {
    pain: '"Hocam ben ne yapacaktım?"',
    fix: "Öğrenci bu haftanın işini telefonundaki Haftam'da görür ve teslim eder.",
  },
  {
    pain: 'Kimin geride kaldığını geç fark ediyorsunuz',
    fix: 'Panel geride kalanı nedeniyle gösterir: geciken iş, düşen tempo, bildirimi gelmeyen öğrenci.',
  },
  {
    pain: '"Çocuğum nasıl gidiyor?" mesajları',
    fix: 'Veli kendi ekranından öğretmenin onayladığı ilerlemeyi görür.',
  },
  {
    pain: "Excel'de öğrenci listesi, defterde kitap takibi",
    fix: 'Öğrenciler, kitaplar ve sayfa/test ilerlemesi tek yerde.',
  },
  {
    pain: 'Ders ücretleri ve ödemeler ayrı bir defterde',
    fix: 'Görüşmeler, öğrenci başına cari hesap ve giderler aynı sistemde.',
  },
]

export function BeforeAfterSection() {
  return (
    <section className="px-6 py-20 md:py-28">
      <div className="mx-auto max-w-4xl">
        <SectionHeading
          eyebrow="Tanıdık geliyor mu?"
          title={`${BRAND.name} bu işleri sizin yerinize toparlar.`}
        />

        <ul className="mt-12 divide-y overflow-hidden rounded-xl border bg-card">
          {PAIRS.map((p) => (
            <li key={p.pain} className="grid gap-2 px-5 py-4 md:grid-cols-[1fr_auto_1.3fr] md:items-center md:gap-4">
              <p className="text-sm text-muted-foreground line-through decoration-destructive/50">
                {p.pain}
              </p>
              <ArrowRight aria-hidden className="hidden size-4 text-primary md:block" />
              <p className="text-sm font-medium">{p.fix}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
