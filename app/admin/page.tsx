import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Building2,
  Clock,
  CreditCard,
  GraduationCap,
  HeartHandshake,
  LifeBuoy,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { SectionUnavailable } from '@/components/shared/section-unavailable'
import { KpiCard } from '@/components/admin/kpi-card'
import { TrendChart } from '@/components/admin/charts/trend-chart'
import { WindowPicker, parseWindow } from '@/components/admin/window-picker'
import { createClient } from '@/lib/supabase/server'
import { listResult } from '@/lib/data-result'
import { formatKurusShort } from '@/lib/billing/pricing'
import { formatRelativeTr } from '@/lib/format'
import { percentChange, splitHalves } from '@/lib/admin/chart-scale'
import {
  dayLabel,
  formatBytes,
  type DayRow,
  type Overview,
  type SystemStatus,
  type UserCounts,
} from '@/lib/admin/types'

export const metadata: Metadata = { title: 'Genel Bakış' }
export const dynamic = 'force-dynamic'

// ============================================================
// GENEL BAKIŞ — "platform şu an ne durumda?"
//
// Üç katman, yukarıdan aşağı: KİM (kullanıcılar ve aktiflik), PARA
// (planlar, tahsilat), NE OLUYOR (günlük eğilimler), NEYE BAKMALI
// (dikkat ve sistem sağlığı).
//
// Mahremiyet: öğrenci ve veli yalnız sayı (124). Her bölüm kendi
// sorgusundan beslenir; biri düşerse yalnız o bölüm "alınamadı" der.
// ============================================================

export default async function AdminOverview({
  searchParams,
}: {
  searchParams: Promise<{ gun?: string }>
}) {
  const days = parseWindow((await searchParams).gun, 30)
  const supabase = await createClient()

  // Değişim oklarının önceki dönemi için pencere iki katı çekilir.
  const [overviewRes, countsRes, seriesRes, systemRes] = await Promise.all([
    supabase.rpc('admin_overview'),
    supabase.rpc('admin_user_counts'),
    supabase.rpc('admin_timeseries', { p_days: Math.min(days * 2, 365) }),
    supabase.rpc('admin_system_status'),
  ])

  const overviewR = listResult(overviewRes, 'admin.overview')
  const countsR = listResult(countsRes, 'admin.user_counts')
  const seriesR = listResult(seriesRes, 'admin.timeseries')
  const systemOk = !systemRes.error

  const overview = overviewR.ok ? (overviewR.data[0] as unknown as Overview) : null
  const counts = countsR.ok ? (countsR.data[0] as unknown as UserCounts) : null
  const allDays = (seriesR.ok ? seriesR.data : []) as unknown as DayRow[]
  const current = allDays.slice(-days)
  const system = systemOk ? (systemRes.data as unknown as SystemStatus) : null

  const series = (key: keyof DayRow) => allDays.map((d) => Number(d[key]))
  const change = (key: keyof DayRow) => {
    const v = series(key)
    if (v.length < days * 2) return null
    const { current: c, previous: p } = splitHalves(v)
    return percentChange(c, p)
  }
  const points = (key: keyof DayRow) =>
    current.map((d) => ({ label: dayLabel(d.day), value: Number(d[key]) }))

  const trials = overview?.trial_workspaces ?? 0
  const licensed = overview?.licensed_workspaces ?? 0
  const conversionBase = trials + licensed
  const conversion = conversionBase > 0 ? `%${Math.round((licensed / conversionBase) * 100)}` : '—'

  // DİKKAT: yalnız gerçekten bir şey varsa çizilir (her gün görünen
  // "her şey yolunda" kartı gürültüdür).
  const attention: { tone: 'destructive' | 'warning'; text: string; href?: string }[] = []
  if (overview) {
    if (overview.expiring_trials > 0)
      attention.push({ tone: 'destructive', text: `${overview.expiring_trials} denemenin bitmesine 3 gün ya da daha az kaldı`, href: '/admin/gelir' })
    if (overview.unmatched_orders > 0)
      attention.push({ tone: 'destructive', text: `${overview.unmatched_orders} sipariş ödeme belirteci olmadan açık — elle mutabakat gerekiyor`, href: '/admin/gelir' })
    if (overview.awaiting_payment > 0)
      attention.push({ tone: 'warning', text: `${overview.awaiting_payment} çalışma alanında tamamlanmamış ödeme var`, href: '/admin/gelir' })
    if (overview.open_tickets > 0)
      attention.push({ tone: 'warning', text: `${overview.open_tickets} açık destek talebi bekliyor`, href: '/admin/talepler' })
    if (overview.at_student_limit > 0)
      attention.push({ tone: 'warning', text: `${overview.at_student_limit} çalışma alanı öğrenci limitine ulaştı`, href: '/admin/musteriler' })
  }
  if (system) {
    if (system.deletion_due > 0)
      attention.push({ tone: 'destructive', text: `${system.deletion_due} silme talebinin süresi doldu — yürütülmeli`, href: '/admin/uyum' })
    if (system.purge_overdue > 0)
      attention.push({ tone: 'destructive', text: `${system.purge_overdue} giriş kaydında 90 günlük kişisel veri temizlenmemiş`, href: '/admin/sistem' })
    const lastPurge = system.cron.find((c) => c.job === 'purge-auth-events')
    if (!lastPurge || new Date(lastPurge.started_at).getTime() < Date.now() - 2 * 86_400_000)
      attention.push({ tone: 'warning', text: 'Saklama temizliği son 48 saatte çalışmadı', href: '/admin/sistem' })
    else if (lastPurge.ok === false)
      attention.push({ tone: 'destructive', text: 'Son saklama temizliği başarısız oldu', href: '/admin/sistem' })
  }

  const windowLabel = days === 365 ? 'son 1 yıl' : `son ${days} gün`

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Genel Bakış" subtitle="Platformun durumu: kullanıcılar, gelir, kullanım ve sağlık" className="mb-0" />
        <WindowPicker basePath="/admin" value={days} />
      </div>

      {attention.length > 0 && (
        <Section title="Dikkat gerektirenler" variant="card">
          <ul className="space-y-2 p-4 text-sm">
            {attention.map((a) => (
              <li key={a.text} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className={a.tone === 'destructive' ? 'mt-1.5 size-2 shrink-0 rounded-full bg-destructive' : 'mt-1.5 size-2 shrink-0 rounded-full bg-warning'}
                />
                {a.href ? (
                  <Link href={a.href} className="underline-offset-4 hover:underline">
                    {a.text}
                  </Link>
                ) : (
                  a.text
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* KİM — kullanıcılar */}
      <Section title="Kullanıcılar" description="Aktif: son 7 günde giriş yapan (öğrencide ayrıca teslim eden)">
        {counts ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Öğretmen"
              value={counts.teachers}
              hint={`${counts.active_teachers_7d} aktif · 30 günde ${counts.active_teachers_30d}`}
              icon={GraduationCap}
              href="/admin/kullanicilar"
            />
            <KpiCard
              label="Öğrenci"
              value={counts.students}
              hint={`${counts.students_with_account} hesaplı · ${counts.active_students_7d} aktif`}
              icon={Users}
            />
            <KpiCard
              label="Veli"
              value={counts.parents}
              hint={`${counts.active_parents_7d} aktif · 30 günde ${counts.active_parents_30d}`}
              icon={HeartHandshake}
            />
            <KpiCard
              label="Günlük aktif kullanıcı"
              value={current.at(-1)?.active_users ?? 0}
              hint={`bugün · ${windowLabel}`}
              trend={series('active_users').slice(-days)}
              change={change('active_users')}
              icon={TrendingUp}
            />
          </div>
        ) : (
          <SectionUnavailable title="Kullanıcı sayıları alınamadı" retryHref="/admin" />
        )}
      </Section>

      {/* PARA — planlar ve tahsilat */}
      <Section title="Müşteriler ve gelir">
        {overview ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Çalışma alanı" value={overview.total_workspaces} hint={counts ? `${counts.new_workspaces_30d} yeni (30 gün)` : undefined} icon={Building2} href="/admin/musteriler" />
            <KpiCard label="Aktif deneme" value={trials} icon={Clock} href="/admin/musteriler?plan=trial" />
            <KpiCard label="Aktif plan" value={licensed} hint={`Deneme → plan ${conversion}`} icon={CreditCard} href="/admin/musteriler?plan=licensed" />
            <KpiCard
              label={`Tahsilat (${windowLabel})`}
              value={formatKurusShort(current.reduce((s, d) => s + Number(d.revenue_kurus), 0))}
              hint={`toplam ${formatKurusShort(overview.revenue_kurus)}`}
              trend={series('revenue_kurus').slice(-days)}
              change={change('revenue_kurus')}
              icon={Wallet}
              href="/admin/gelir"
            />
            <KpiCard
              label="Bekleyen ödeme"
              value={formatKurusShort(overview.pending_kurus)}
              icon={Wallet}
              tone={overview.pending_kurus > 0 ? 'warning' : 'default'}
              href="/admin/gelir"
            />
            <KpiCard
              label="Açık talep"
              value={overview.open_tickets}
              icon={LifeBuoy}
              tone={overview.open_tickets > 0 ? 'warning' : 'default'}
              href="/admin/talepler"
            />
          </div>
        ) : (
          <SectionUnavailable title="Özet alınamadı" retryHref="/admin" />
        )}
      </Section>

      {/* NE OLUYOR — günlük eğilimler (küçük katlar: her ölçü kendi grafiği) */}
      <Section title="Kullanım eğilimi" description={`${windowLabel}, günlük`}>
        {seriesR.ok ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {(
              [
                ['Günlük aktif kullanıcı', 'active_users', 'line'],
                ['Yeni çalışma alanı', 'new_workspaces', 'bar'],
                ['Verilen ödev', 'homework_published', 'bar'],
                ['Öğrenci teslimi', 'submissions', 'line'],
                ['Öğretmen onayı', 'approvals', 'line'],
                ['Yapılan görüşme', 'sessions_done', 'bar'],
              ] as const
            ).map(([title, key, kind]) => (
              <div key={key} className="rounded-lg border bg-card p-4">
                <p className="mb-2 flex items-baseline justify-between gap-2 text-sm font-medium">
                  {title}
                  <span className="text-xs font-normal tabular-nums text-muted-foreground">
                    toplam {current.reduce((s, d) => s + Number(d[key]), 0).toLocaleString('tr-TR')}
                  </span>
                </p>
                <TrendChart title={title} data={points(key)} kind={kind} />
              </div>
            ))}
          </div>
        ) : (
          <SectionUnavailable title="Eğilim verisi alınamadı" retryHref="/admin" />
        )}
      </Section>

      {/* SAĞLIK — kısa özet; ayrıntı Sistem sekmesinde */}
      <Section title="Sistem sağlığı" action={<Link href="/admin/sistem" className="text-sm underline-offset-4 hover:underline">Ayrıntı</Link>}>
        {system ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Veritabanı" value={formatBytes(system.db_bytes)} />
            <KpiCard
              label="Saklama temizliği"
              value={
                system.cron.find((c) => c.job === 'purge-auth-events')
                  ? formatRelativeTr(system.cron.find((c) => c.job === 'purge-auth-events')!.started_at)
                  : 'hiç çalışmadı'
              }
              tone={system.purge_overdue > 0 ? 'destructive' : 'default'}
              hint={system.purge_overdue > 0 ? `${system.purge_overdue} kayıt gecikmiş` : 'gecikmiş kayıt yok'}
            />
            <KpiCard
              label="Silme talepleri"
              value={system.deletion_pending}
              hint={system.deletion_due > 0 ? `${system.deletion_due} vadesi geldi` : 'vadesi gelen yok'}
              tone={system.deletion_due > 0 ? 'destructive' : 'default'}
              href="/admin/uyum"
            />
            <KpiCard
              label={`Başarısız giriş (${windowLabel})`}
              value={current.reduce((s, d) => s + Number(d.failed_logins), 0)}
              trend={series('failed_logins').slice(-days)}
              change={change('failed_logins')}
              upIsGood={false}
              href="/admin/guvenlik"
            />
          </div>
        ) : (
          <SectionUnavailable title="Sistem durumu alınamadı" retryHref="/admin" />
        )}
      </Section>
    </div>
  )
}
