import { Check } from 'lucide-react'
import { SectionHeading } from './section-heading'

// ÖĞRETMEN ONAYLI İLERLEME.
//
// ============================================================
// NEDEN AYRI BİR BÖLÜM
//
// Bu, ürünün en ayırt edici davranışı ve bir cümlelik özellik maddesi
// olarak geçiştirilemeyecek kadar önemli: öğrencinin beyanı ilerlemeyi
// DEĞİŞTİRMİYOR. Öğrenci "yaptım" der, kayda geçen tek şey öğretmenin
// onayıdır (migration 014, `approve_homework_item`).
//
// Rakamların güvenilir olmasının sebebi bu; sayfadaki bütün ilerleme
// vaadi buraya dayanıyor.
// ============================================================

const BENEFITS = [
  'Öğrencinin beyanı ile gerçek ilerlemeyi ayırın',
  'Hangi öğrencinin gerçekten çalıştığını görün',
  'İlerleme yüzdelerini güvenilir tutun',
  'Haftalık takibi daha kolay yönetin',
]

export function ApprovalSection() {
  return (
    <section className="border-y bg-muted/30 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Öğretmen onayı"
          title="Öğrenci &quot;yaptım&quot; dedi diye iş bitmez."
          description="Öğrenci görevini tamamladığını işaretler. Siz kontrol edip onayladığınızda ilerlemesi sisteme işlenir."
        />

        <ul className="mx-auto mt-10 grid max-w-2xl gap-3 sm:grid-cols-2">
          {BENEFITS.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success-foreground" />
              {item}
            </li>
          ))}
        </ul>

        <p className="mt-8 text-center text-sm font-medium">Kontrol sizde.</p>
      </div>
    </section>
  )
}
