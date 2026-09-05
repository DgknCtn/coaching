import { Check } from 'lucide-react'
import { SectionHeading } from './section-heading'

// VELİ PANELİ.
//
// ============================================================
// SATILAN ŞEY ÖZELLİK DEĞİL, GERİ KAZANILAN ZAMAN
//
// "Veli paneli var" bir özellik cümlesi. Öğretmen için asıl değer, her
// hafta tekrarlanan "çocuğum nasıl gidiyor?" konuşmasının ortadan
// kalkması — bölüm bu yüzden panelin varlığını değil, o konuşmanın
// bitişini anlatıyor.
//
// Velinin gördüğü veri öğretmenin ONAYLADIĞI veri; bu bölüm bir önceki
// bölümün üstüne biniyor ve sırası bu yüzden onun hemen ardında.
// ============================================================

const VISIBLE = [
  'Tamamlanan ödevler',
  'Geciken görevler',
  'Kitap ilerlemesi',
  'Haftalık performans',
]

export function ParentSection() {
  return (
    <section className="px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Veli paneli"
          title="Veliler her hafta &quot;Çocuğum nasıl gidiyor?&quot; diye sormasın."
          description="Öğrencinin ödevleri, kitap ilerlemesi ve haftalık durumu velinin kendi panelinde görünür. Siz anlatmak yerine sistem göstersin."
        />

        <ul className="mx-auto mt-10 grid max-w-2xl gap-3 sm:grid-cols-2">
          {VISIBLE.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success-foreground" />
              {item}
            </li>
          ))}
        </ul>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Veli bilgilendirmesi için ayrıca zaman harcamayın.
        </p>
      </div>
    </section>
  )
}
