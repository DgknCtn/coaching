import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarClock, CreditCard, Handshake, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { SectionUnavailable } from '@/components/shared/section-unavailable'
import { Badge } from '@/components/ui/badge'
import { KpiCard } from '@/components/admin/kpi-card'
import { TrendChart } from '@/components/admin/charts/trend-chart'
import { WindowPicker, parseWindow } from '@/components/admin/window-picker'
import { createClient } from '@/lib/supabase/server'
import { formatKurus, formatKurusShort } from '@/lib/billing/pricing'
import { daysLeft } from '@/lib/plans'
import { formatDateTr, formatRelativeTr } from '@/lib/format'
import { monthLabel, type Revenue } from '@/lib/admin/types'

export const metadata: Metadata = { title: 'Gelir' }
export const dynamic = 'force-dynamic'

// ============================================================
// GELİR — "para nasıl gidiyor?"
//
// admin_revenue (124): aylık tahsilat (ödeme tarihine göre, İstanbul
// saati), aktif lisanslar, 30 gün içinde bitecek lisans ve denemeler,
// başarısız ve bekleyen siparişler.
//
// BU AY KISMİ: ay bitmeden önceki ayla yüzde karşılaştırması her ayın
// başında sahte bir düşüş gösterirdi. Bu yüzden değişim yüzdesi yok;
// geçen ayın toplamı yanında yazıyor.
//
// BELİRTEÇSİZ SİPARİŞ (068): bir saatten eski, ödeme belirteci olmayan
// açık sipariş ödeme sağlayıcısıyla eşleşemez — elle mutabakat ister.
// ============================================================

const MONTH_OPTIONS = [6, 12, 24] as const
const HOUR = 3_600_000

export default async function AdminRevenue({
  searchParams,
}: {
  searchParams: Promise<{ ay?: string }>
}) {
  const months = parseWindow((await searchParams).ay, 12, MONTH_OPTIONS)
  const supabase = await createClient()

  const [revenueRes, partnersRes] = await Promise.all([
    supabase.rpc('admin_revenue', { p_months: months }),
    supabase.rpc('admin_list_partners'),
  ])
  const revenue = revenueRes.error ? null : (revenueRes.data as unknown as Revenue)
  const partnerUnpaid = partnersRes.error
    ? null
    : ((partnersRes.data ?? []) as { unpaid_kurus: number | null }[]).reduce(
        (s, r) => s + Number(r.unpaid_kurus ?? 0),
        0
      )

  const now = Date.now()
  const monthly = revenue?.monthly ?? []
  const thisMonth = monthly.at(-1)
  const lastMonth = monthly.at(-2)
  const fullMonths = monthly.slice(0, -1)
  const avgKurus =
    fullMonths.length > 0 ? fullMonths.reduce((s, m) => s + Number(m.kurus), 0) / fullMonths.length : 0
  const periodKurus = monthly.reduce((s, m) => s + Number(m.kurus), 0)
  const pendingKurus = (revenue?.pending ?? []).reduce((s, o) => s + Number(o.kurus), 0)
  const unmatched = (o: Revenue['pending'][number]) =>
    !o.has_token && now - new Date(o.created_at).getTime() > HOUR

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="Gelir"
          subtitle="Tahsilat, lisanslar, yaklaşan bitişler ve sorunlu ödemeler"
          className="mb-0"
        />
        <WindowPicker
          basePath="/admin/gelir"
          value={months}
          param="ay"
          options={MONTH_OPTIONS}
          label={(n) => `${n} ay`}
        />
      </div>

      {!revenue ? (
        <SectionUnavailable title="Gelir verisi alınamadı" retryHref="/admin/gelir" />
      ) : (
        <>
          <Section title="Özet">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Bu ay (şu ana kadar)"
                value={formatKurusShort(Number(thisMonth?.kurus ?? 0))}
                hint={
                  lastMonth
                    ? `geçen ay ${formatKurusShort(Number(lastMonth.kurus))} · ${thisMonth?.orders ?? 0} ödeme`
                    : undefined
                }
                icon={Wallet}
              />
              <KpiCard
                label={`Son ${months} ay`}
                value={formatKurusShort(periodKurus)}
                hint={`tamamlanan aylarda ortalama ${formatKurusShort(avgKurus)} / ay`}
                icon={Wallet}
              />
              <KpiCard
                label="Aktif lisans"
                value={revenue.active_licenses}
                hint={`${revenue.licensed_students} öğrenci hakkı`}
                icon={CreditCard}
              />
              <KpiCard
                label="30 günde bitecek"
                value={revenue.expiring.length}
                hint={`${revenue.expiring.filter((e) => e.kind === 'license').length} lisans · ${revenue.expiring.filter((e) => e.kind === 'trial').length} deneme`}
                icon={CalendarClock}
                tone={revenue.expiring.some((e) => (daysLeft(e.ends_at) ?? 99) <= 3) ? 'warning' : 'default'}
              />
            </div>
          </Section>

          <Section title="Aylık tahsilat" description="Ödeme tarihine göre, TL. Son sütun içinde bulunulan ay (kısmi).">
            <div className="rounded-lg border bg-card p-4">
              <TrendChart
                title="Aylık tahsilat (TL)"
                kind="bar"
                data={monthly.map((m) => ({
                  label: monthLabel(m.month),
                  value: Math.round(Number(m.kurus) / 100),
                }))}
              />
            </div>
          </Section>

          <Section
            title="30 gün içinde bitecekler"
            description="Yenileme ya da dönüşüm için hatırlatma zamanı"
            variant="card"
          >
            {revenue.expiring.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Önümüzdeki 30 günde biten lisans ya da deneme yok.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Çalışma alanı</th>
                      <th className="px-4 py-2 font-medium">Tür</th>
                      <th className="px-4 py-2 font-medium">Bitiş</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenue.expiring.map((e) => {
                      const left = daysLeft(e.ends_at) ?? 0
                      return (
                        <tr key={`${e.workspace_id}-${e.kind}`} className="border-b last:border-0">
                          <td className="px-4 py-2">
                            <Link
                              href={`/admin/calisma-alanlari/${e.workspace_id}`}
                              className="underline-offset-4 hover:underline"
                            >
                              {e.workspace_name}
                            </Link>
                          </td>
                          <td className="px-4 py-2">
                            {e.kind === 'trial' ? (
                              <Badge variant="info">Deneme</Badge>
                            ) : (
                              <span>Plan · {e.student_count} öğrenci</span>
                            )}
                          </td>
                          <td className="px-4 py-2 tabular-nums">
                            {formatDateTr(e.ends_at)}{' '}
                            <span className={left <= 3 ? 'text-warning-foreground' : 'text-muted-foreground'}>
                              · {left} gün
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            title="Bekleyen siparişler"
            description={
              revenue.pending.length > 0
                ? `${revenue.pending.length} sipariş · ${formatKurusShort(pendingKurus)}`
                : undefined
            }
            variant="card"
          >
            {revenue.pending.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Tamamlanmamış sipariş yok.</p>
            ) : (
              <ul className="divide-y text-sm">
                {revenue.pending.map((o) => (
                  <li key={o.order_id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2">
                    <span className="min-w-0">
                      <Link
                        href={`/admin/calisma-alanlari/${o.workspace_id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {o.workspace_name}
                      </Link>{' '}
                      <span className="tabular-nums text-muted-foreground">{formatKurus(Number(o.kurus))}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {unmatched(o) && <Badge variant="destructive">Belirteç yok · elle mutabakat</Badge>}
                      {formatRelativeTr(o.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Başarısız ödemeler" description="Son 50; neden ödeme sağlayıcısından" variant="card">
            {revenue.failed.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Başarısız ödeme yok.</p>
            ) : (
              <ul className="divide-y text-sm">
                {revenue.failed.map((o) => (
                  <li key={o.order_id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2">
                    <span className="min-w-0">
                      <Link
                        href={`/admin/calisma-alanlari/${o.workspace_id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {o.workspace_name}
                      </Link>{' '}
                      <span className="tabular-nums">{formatKurus(Number(o.kurus))}</span>{' '}
                      <span className="text-muted-foreground">· {o.reason ?? 'neden kaydedilmemiş'}</span>
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">{formatDateTr(o.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      <Section title="Partnerler">
        <div className="max-w-sm">
          <KpiCard
            href="/admin/partnerler"
            label="Ödenmemiş partner komisyonu"
            value={partnerUnpaid === null ? '—' : formatKurusShort(partnerUnpaid)}
            hint={partnerUnpaid === null ? 'alınamadı' : 'ayrıntı ve ödeme: Partnerler'}
            icon={Handshake}
            tone={partnerUnpaid ? 'warning' : 'default'}
          />
        </div>
      </Section>
    </div>
  )
}
