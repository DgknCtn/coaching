import { GraduationCap, BookOpen, Users, Check } from 'lucide-react'

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
      'Haftalık risk analizi (Kritik / Dikkat / İyi)',
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
    tagline: 'Çocuğunuzla her an bağlı kalın',
    Icon: Users,
    description:
      'Çocuğunuzun gelişimini anlık takip edin. Koçla uyum içinde kalın, kritik anlarda haberdar olun.',
    features: [
      'Haftalık performans kartları',
      'Geciken ödev bildirimleri',
      'Kitap ilerleme takibi',
      'Birden fazla öğrenci desteği',
      'Davet linki ile kolay kayıt',
    ],
  },
]

export function FeaturesSection() {
  return (
    <section id="ozellikler" className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Üç rol, tek platform
          </h2>
          <p className="mt-3 text-muted-foreground">
            Koç, öğrenci ve veliler için tasarlanmış birbirine bağlı bir deneyim.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {roles.map((r) => (
            <div key={r.id} className="flex flex-col rounded-lg border bg-card p-6">
              <r.Icon className="size-4 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">{r.role}</p>
              <h3 className="mt-1 text-sm font-semibold leading-snug">{r.tagline}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {r.description}
              </p>

              <ul className="mt-6 space-y-2">
                {r.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
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
