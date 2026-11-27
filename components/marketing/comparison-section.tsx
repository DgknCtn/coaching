import Link from 'next/link'
import { ArrowRight, Check, Minus, X } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { registerHref } from '@/lib/signup-source'
import { TRIAL_CTA_LABEL } from '@/lib/plans'
import { BRAND } from '@/lib/brand'
import { SectionHeading } from './section-heading'

// KARŞILAŞTIRMA — okuyucunun GERÇEK alternatifi: WhatsApp + Excel + defter.
// Marka adı yok, yalnız kategori. İZ sütunundaki her iddia bugün çalışan
// bir özelliğe karşılık gelir (tests/landing-content.test.ts). "Genel ödev
// uygulamaları" sütunu bilinçli olarak temkinli: "kısmen" ya da "yok".

export type Support = 'yes' | 'partial' | 'no'

export const COMPARISON: { feature: string; manual: Support; generic: Support; iz: Support }[] = [
  { feature: 'Ödevi öğrenci telefonundan teslim eder', manual: 'no', generic: 'yes', iz: 'yes' },
  { feature: 'İlerlemeye yalnız öğretmenin onayladığı iş sayılır', manual: 'no', generic: 'partial', iz: 'yes' },
  { feature: 'Kitap içinde test ve sayfa düzeyinde takip', manual: 'partial', generic: 'no', iz: 'yes' },
  { feature: 'Veli kendi ekranından onaylı ilerlemeyi görür', manual: 'no', generic: 'partial', iz: 'yes' },
  { feature: 'Google Takvim’deki dersler kendiliğinden gelir', manual: 'no', generic: 'no', iz: 'yes' },
  { feature: 'Ders sonucu, telafi ve öğrenci cari hesabı', manual: 'partial', generic: 'no', iz: 'yes' },
  { feature: 'Öğrenci ve veliye e-postasız giriş (kullanıcı adı + PIN)', manual: 'no', generic: 'no', iz: 'yes' },
  { feature: 'Veri çalışma alanı düzeyinde yalıtılmış, KVKK uyumlu', manual: 'no', generic: 'partial', iz: 'yes' },
]

const COLUMNS = [
  { key: 'manual', label: 'WhatsApp + Excel + defter' },
  { key: 'generic', label: 'Genel ödev uygulamaları' },
  { key: 'iz', label: BRAND.name },
] as const

function Cell({ value, strong }: { value: Support; strong?: boolean }) {
  if (value === 'yes')
    return (
      <span className={strong ? 'text-primary' : 'text-success-foreground'}>
        <Check className="mx-auto size-4" aria-hidden />
        <span className="sr-only">Var</span>
      </span>
    )
  if (value === 'partial')
    return (
      <span className="text-warning-foreground">
        <Minus className="mx-auto size-4" aria-hidden />
        <span className="sr-only">Kısmen</span>
      </span>
    )
  return (
    <span className="text-muted-foreground/60">
      <X className="mx-auto size-4" aria-hidden />
      <span className="sr-only">Yok</span>
    </span>
  )
}

export function ComparisonSection() {
  return (
    <section id="karsilastir" className="scroll-mt-16 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-4xl">
        <SectionHeading
          eyebrow="Karşılaştırın"
          title="Neden mesajlaşma uygulaması ve tablo değil?"
          description="Ödev takibi, veli bilgilendirme ve ders kaydı için bugün kullandığınız araçlarla yan yana."
        />
        <div className="mt-12 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">
              {BRAND.name}, WhatsApp + Excel + defter ve genel ödev uygulamalarının özellik karşılaştırması
            </caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Özellik
                </th>
                {COLUMNS.map(c => (
                  <th
                    key={c.key}
                    scope="col"
                    className={
                      c.key === 'iz'
                        ? 'w-28 bg-primary/5 px-3 py-3 text-center font-semibold text-primary'
                        : 'w-32 px-3 py-3 text-center text-xs font-medium text-muted-foreground'
                    }
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {COMPARISON.map(row => (
                <tr key={row.feature}>
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    {row.feature}
                  </th>
                  <td className="px-3 py-3 text-center">
                    <Cell value={row.manual} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Cell value={row.generic} />
                  </td>
                  <td className="bg-primary/5 px-3 py-3 text-center">
                    <Cell value={row.iz} strong />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          <Minus className="inline size-3 text-warning-foreground" aria-hidden /> kısmen: elle ya da ek araçla
          yapılabilir.
        </p>
        <div className="mt-8 flex justify-center">
          <Link href={registerHref('karsilastir')} className={buttonVariants({ size: 'lg' })}>
            {TRIAL_CTA_LABEL}
            <ArrowRight />
          </Link>
        </div>
      </div>
    </section>
  )
}
