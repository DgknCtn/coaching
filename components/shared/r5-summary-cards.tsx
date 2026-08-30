import Link from 'next/link'
import { ArrowRight, BookOpen, CalendarRange, ShieldCheck } from 'lucide-react'
import type {
  AcademicFlowSummary,
  PoolSummaryItem,
  ResourcePlanSummary,
} from '@/lib/student-overview'
import { ProgressBar } from '@/components/shared/progress-bar'

// R5 Öğrenci Genel Bakış — üç özet kart (R5.5 §7.1).
//
// Amaç R5'in TAMAMINI ana ekrana yığmak değil; üç sistemin NABZINI
// göstermek ve detay ekranlarına geçiş sağlamak.
//
// İKİ SINIR (§7.2):
//   - Yorumlayıcı risk/sağlık/düzen puanı ÜRETİLMEZ. Burada hiçbir yerde
//     "bu öğrenci geride" gibi bir yargı yok; yalnız sayı ve isim var.
//   - R5 verisi olmayan öğrencide ekran KIRILMAZ; nötr boş durum yazar.
//
// Mevcut R4 operasyon kartları (Açık Ödev / Onay Bekleyen / Süresi Geçen)
// bu bloktan BAĞIMSIZ yaşamaya devam eder — ayrı katman (OG-09).

interface Props {
  studentId: string
  flow: AcademicFlowSummary
  resources: ResourcePlanSummary
  pool: { top: PoolSummaryItem[]; total: number }
}

export function R5SummaryCards({ studentId, flow, resources, pool }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <SummaryCard
        icon={CalendarRange}
        title="Akademik Akış"
        description="Müfredat akışının mevcut durumu"
        href={`/teacher/students/${studentId}/curriculum`}
        linkLabel="Akışı aç"
      >
        {!flow.current && !flow.upcoming ? (
          <Empty>Henüz müfredat akışı atanmadı.</Empty>
        ) : (
          <dl className="space-y-2 text-sm">
            {flow.scopeName && (
              <p className="text-xs text-muted-foreground">
                {flow.scopeName}
                {flow.otherScopeCount > 0 && ` · +${flow.otherScopeCount} ders daha`}
              </p>
            )}
            <Row label="Şu an" value={flow.current?.topicName ?? '—'} />
            <Row label="Yaklaşan" value={flow.upcoming?.topicName ?? '—'} />
          </dl>
        )}
      </SummaryCard>

      <SummaryCard
        icon={BookOpen}
        title="Kaynak Planı"
        description="Atanmış kaynaklar ve plan ilerlemesi"
        href={`/teacher/students/${studentId}/goals`}
        linkLabel="Kaynak planını aç"
      >
        {resources.activeCount + resources.pendingCount + resources.completedCount === 0 ? (
          <Empty>Henüz kaynak atanmadı.</Empty>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs text-muted-foreground">
              {resources.activeCount} aktif · {resources.pendingCount} bekliyor ·{' '}
              {resources.completedCount} tamamlandı
            </p>

            {/* Ana gösterge PLAN %'dir; Kitap % detay ekranında kalır. */}
            {resources.averagePlanPercentage !== null && (
              <div className="space-y-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">Ortalama plan</span>
                  <span className="font-semibold tabular-nums">
                    %{resources.averagePlanPercentage}
                  </span>
                </div>
                <ProgressBar
                  value={resources.averagePlanPercentage}
                  label="Aktif kaynakların ortalama plan ilerlemesi"
                />
              </div>
            )}

            <ul className="space-y-1">
              {resources.topActive.map(r => (
                <li key={r.bookId} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground">{r.title}</span>
                  <span className="shrink-0 tabular-nums">%{r.planPercentage}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SummaryCard>

      <SummaryCard
        icon={ShieldCheck}
        title="Koruma Havuzu"
        description="Uzun süredir temas edilmeyen konular"
        href={`/teacher/students/${studentId}/protection`}
        linkLabel="Koruma havuzunu aç"
      >
        {pool.total === 0 ? (
          <Empty>Havuzda konu yok.</Empty>
        ) : (
          <div className="space-y-2">
            {/* Kart bir nabız göstergesidir, liste değil: yalnız en eski
                birkaç konu görünür (OG-06). Tamamı detay ekranında. */}
            <ol className="space-y-1">
              {pool.top.map((t, i) => (
                <li key={t.topicId} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 gap-1.5">
                    <span className="tabular-nums text-muted-foreground">{i + 1}.</span>
                    <span className="truncate">{t.topicName}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {t.daysSinceContact} gün
                  </span>
                </li>
              ))}
            </ol>
            {pool.total > pool.top.length && (
              <p className="text-xs text-muted-foreground">
                +{pool.total - pool.top.length} konu daha
              </p>
            )}
          </div>
        )}
      </SummaryCard>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  title,
  description,
  href,
  linkLabel,
  children,
}: {
  icon: typeof BookOpen
  title: string
  description: string
  href: string
  linkLabel: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-start gap-2.5">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        >
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="flex-1">{children}</div>

      <Link
        href={href}
        className="mt-3 inline-flex items-center gap-1 border-t pt-2 text-xs text-primary hover:underline"
      >
        {linkLabel}
        <ArrowRight className="size-3" />
      </Link>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{value}</dd>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}
