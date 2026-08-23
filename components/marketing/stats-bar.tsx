import { Users, BookOpen, ClipboardCheck, ShieldCheck } from 'lucide-react'

// Önceden burada "500+ Aktif Öğrenci", "50+ Koç", "%94 Memnuniyet" gibi
// UYDURMA rakamlar vardı. Ürün henüz satılmadığı için bunlar doğru değildi
// ve ilk müşteride fark edildiğinde en başta güven kaybettirirdi.
//
// Yerine ürünün BUGÜN yaptığı, doğrulanabilir şeyler yazıldı. Gerçek
// kullanım rakamları oluştuğunda buraya onlar konabilir.

const FACTS = [
  {
    icon: Users,
    title: 'Üç rol, tek sistem',
    detail: 'Öğretmen, öğrenci ve veli aynı veriyi kendi paneline uygun şekilde görür.',
  },
  {
    icon: BookOpen,
    title: 'Test ve sayfa takibi',
    detail: 'Kitabı test sayısıyla da, "sf. 1-56" gibi sayfa aralığıyla da takip edin.',
  },
  {
    icon: ClipboardCheck,
    title: 'Öğretmen onaylı ilerleme',
    detail: 'Yüzdeler yalnız sizin onayladığınız çalışmalardan hesaplanır.',
  },
  {
    icon: ShieldCheck,
    title: 'Veri yalıtımı',
    detail: 'Her çalışma alanı veritabanı düzeyinde ayrıdır; kimse diğerini göremez.',
  },
]

export function StatsBar() {
  return (
    <section className="border-y bg-muted/30">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        {FACTS.map((fact) => (
          <div key={fact.title}>
            <fact.icon className="size-5 text-primary" />
            <p className="mt-3 text-sm font-semibold">{fact.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {fact.detail}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
