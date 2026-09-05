import { GraduationCap, BookOpen, Users, Check } from 'lucide-react'
import { SectionHeading } from './section-heading'

const roles = [
  {
    id: 'koc',
    role: 'Koç',
    tagline: 'Sınıfınızı bir bakışta görün',
    Icon: GraduationCap,
    description:
      'Tüm öğrencilerinizi tek ekrandan yönetin. Risk analiziyle kimlerin takibe ihtiyacı olduğunu erkenden görün.',
    features: [
      'Öğrenci başına kitap ataması',
      'Geride kalan öğrencileri siz fark etmeden sistem fark etsin',
      // Ürünün rozet sözlüğüyle birebir aynı üçlü (status-badge.tsx).
      // Kullanıcı kaydolduktan sonra bu kelimelerin aynısını görüyor.
      'Kritik / Dikkat / İyi olarak haftalık durum',
      'Ödev oluşturma ve ilerleme takibi',
      'Veli & öğrenci davet sistemi',
      'Eğitim dönemi yönetimi',
    ],
  },
  {
    id: 'ogrenci',
    role: 'Öğrenci',
    tagline: 'Odaklan, ilerle, başar',
    Icon: BookOpen,
    description:
      'Ödevlerini ve kitap ilerlemeni takip et. Gecikmeleri önceden gör, hedeflerine odaklan.',
    features: [
      'Güncel ödev listesi (geciken / yaklaşan)',
      'Test tamamlama işaretleme',
      'Kitap bölümü ilerleme çubuğu',
      'Haftalık performans özeti',
      'Çoklu kitap desteği',
    ],
  },
  {
    id: 'veli',
    role: 'Veli',
    tagline: 'Çocuğunuzun ilerlemesini kendiniz görün',
    Icon: Users,
    // BİLDİRİM SİSTEMİ YOK — kod tabanında e-posta ya da push gönderen
    // hiçbir şey bulunmuyor. Önceki metin "geciken ödev bildirimleri" ve
    // "kritik anlarda haberdar olun" diyerek olmayan bir özelliği vaat
    // ediyordu. Veli panele girip bakar; dil buna göre.
    description:
      'Çocuğunuzun gelişimini kendi panelinizden izleyin. Geciken ödevleri ve ilerlemeyi öğretmenle aynı veriden görün.',
    features: [
      'Haftalık performans kartları',
      'Geciken ödevleri panelde görme',
      'Kitap ilerleme takibi',
      'Birden fazla öğrenci desteği',
      'Davet linki ile kolay kayıt',
    ],
  },
]

export function FeaturesSection() {
  return (
    <section id="ozellikler" className="scroll-mt-16 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Roller"
          title="Öğretmen yönetir. Öğrenci uygular. Veli takip eder."
          description="Herkes aynı veriyi görür, herkes kendi ekranından takip eder."
        />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {roles.map((r) => (
            <div
              key={r.id}
              className="flex flex-col rounded-lg border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                <r.Icon className="size-4 text-primary" />
              </span>
              <p className="mt-4 text-sm text-muted-foreground">{r.role}</p>
              <h3 className="mt-1 text-sm font-semibold leading-snug">{r.tagline}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {r.description}
              </p>

              <ul className="mt-6 space-y-2">
                {r.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-success-foreground" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
