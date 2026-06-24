import {
  ClipboardList,
  AlertTriangle,
  Bell,
  Library,
  BarChart3,
  Link2,
} from 'lucide-react'

const features = [
  {
    Icon: ClipboardList,
    title: 'Ödev Takibi',
    description:
      'Test bazında ödev oluştur, tamamlanma durumunu anlık gör. Geciken ödevler otomatik işaretlenir.',
  },
  {
    Icon: AlertTriangle,
    title: 'Risk Analizi',
    description:
      'Tamamlama oranına göre her öğrenciye otomatik risk skoru. Kritik olanları kaçırma.',
  },
  {
    Icon: Bell,
    title: 'Veli Bildirimleri',
    description:
      'Veliler haftalık özeti görür, gecikmeleri anlık takip eder. Şeffaf iletişim her zaman.',
  },
  {
    Icon: Library,
    title: 'Kitap Havuzu',
    description:
      'Bölüm ve test yapısıyla kitap ekle, öğrencilere ata. YKS, LGS, KPSS için hazır şablonlar.',
  },
  {
    Icon: BarChart3,
    title: 'İlerleme Grafikleri',
    description:
      'Her öğrencinin kitap bazında ilerleme yüzdesi. Haftalık ve dönemlik karşılaştırma.',
  },
  {
    Icon: Link2,
    title: 'Davet Sistemi',
    description:
      'Tek link ile öğrenci ve veli kaydı. Token tabanlı güvenli davet, çoklu kullanıcı desteği.',
  },
]

export function FeatureGrid() {
  return (
    <section className="py-14 sm:py-24 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-10 sm:mb-16">
          <div
            className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4 border"
            style={{
              color: 'oklch(0.57 0.26 282)',
              borderColor: 'oklch(0.57 0.26 282 / 0.3)',
              background: 'oklch(0.57 0.26 282 / 0.08)',
            }}
          >
            Özellikler
          </div>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-3 sm:mb-4">
            İhtiyacınız Olan Her Şey
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto">
            Koçluk sürecinizi verimli hale getirecek araçlar, tek bir platformda.
          </p>
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="group bg-card rounded-2xl border p-6 hover:border-primary/30 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-all duration-200 group-hover:scale-110"
                style={{
                  background: 'oklch(0.57 0.26 282 / 0.08)',
                }}
              >
                <f.Icon className="size-5" style={{ color: 'oklch(0.57 0.26 282)' }} />
              </div>
              <h3 className="font-bold text-base mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
