import type { Metadata } from 'next'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { SectionUnavailable } from '@/components/shared/section-unavailable'
import { createClient } from '@/lib/supabase/server'
import { CATEGORIES } from '@/lib/features/catalog'

// PAZARLAMA ÖZETİ — Feature Showcase PRD §14.3 KPI paneli (migration 158).
// Veriler anonim olay sayılarıdır; kişi bazlı hiçbir bilgi yoktur.
// Kayıt kaynakları auth üst verisindeki signup_source'tan (kayıt anı).

export const metadata: Metadata = { title: 'Pazarlama' }
export const dynamic = 'force-dynamic'

interface Summary {
  days: number
  events: Record<string, number>
  categories: Record<string, number>
  ctas: Record<string, number>
  devices: Record<string, number>
  signups: Record<string, number>
}

const EVENT_LABEL: Record<string, string> = {
  features_page_view: 'Özellik sayfası ziyareti',
  feature_category_view: 'Kategori görüntüleme',
  feature_screenshot_click: 'Ekran büyütme',
  feature_trial_click: 'Deneme tıklaması (özellikler)',
  feature_demo_click: 'Demo tıklaması (özellikler)',
  feature_pricing_view: 'Fiyat bölümü görüntüleme',
  feature_faq_open: 'SSS açılışı',
  feature_cta_click: 'Kategori kartı tıklaması',
  homepage_feature_preview_view: 'Anasayfa önizleme görüntüleme',
  homepage_features_cta_click: 'Anasayfa → özellikler tıklaması',
  trial_started_from_features: 'Kayıt sayfası açılışı (özelliklerden)',
}

function pct(a: number, b: number): string {
  return b > 0 ? `%${Math.round((a / b) * 1000) / 10}` : '—'
}

function Table({ rows, label }: { rows: [string, number][]; label: string }) {
  if (rows.length === 0) return <p className="px-4 py-3 text-sm text-muted-foreground">Henüz veri yok.</p>
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{label}</caption>
      <tbody className="divide-y">
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row" className="px-4 py-2 text-left font-normal">
              {k}
            </th>
            <td className="px-4 py-2 text-right tabular-nums">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const sorted = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1])

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ gun?: string }> }) {
  const { gun } = await searchParams
  const days = [7, 30, 90].includes(Number(gun)) ? Number(gun) : 30
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_marketing_summary', { p_days: days })
  const s = data as Summary | null

  const views = s?.events.features_page_view ?? 0
  const trials = s?.events.feature_trial_click ?? 0
  const demos = s?.events.feature_demo_click ?? 0
  const previewViews = s?.events.homepage_feature_preview_view ?? 0
  const homeCta = s?.events.homepage_features_cta_click ?? 0
  const featureSignups = (s?.signups.ozellikler ?? 0) + (s?.signups.onizleme ?? 0)
  const catName = new Map(CATEGORIES.map(c => [c.slug, c.name]))

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <PageHeader title="Pazarlama" subtitle={`Son ${days} gün · anonim olaylar`} />
      <nav aria-label="Dönem" className="flex gap-2 text-sm">
        {[7, 30, 90].map(d => (
          <a
            key={d}
            href={`?gun=${d}`}
            aria-current={d === days ? 'page' : undefined}
            className={d === days ? 'rounded-md bg-primary px-3 py-1 text-primary-foreground' : 'rounded-md border px-3 py-1'}
          >
            {d} gün
          </a>
        ))}
      </nav>

      {error || !s ? (
        <SectionUnavailable title="Pazarlama özeti yüklenemedi" retryHref={`/admin/pazarlama?gun=${days}`} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Özellik sayfası ziyareti', value: String(views) },
              { label: 'Ziyaret → deneme tıklaması', value: pct(trials, views) },
              { label: 'Ziyaret → demo tıklaması', value: pct(demos, views) },
              { label: 'Anasayfa önizleme → özellikler', value: pct(homeCta, previewViews) },
            ].map(m => (
              <div key={m.label} className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums">{m.value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Özellik sayfası ve önizlemeden gelen kayıt: <strong className="text-foreground">{featureSignups}</strong>. Kayıt
            sayısı kayıt anındaki kaynak etiketinden; tıklama sayıları anonim olaylardan gelir.
          </p>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Olaylar" variant="card">
              <Table label="Olay sayıları" rows={sorted(s.events).map(([k, v]) => [EVENT_LABEL[k] ?? k, v])} />
            </Section>
            <Section title="Kayıtlar (kaynağa göre)" variant="card">
              <Table label="Kaynağa göre kayıtlar" rows={sorted(s.signups)} />
            </Section>
            <Section title="Kategori ilgisi" variant="card">
              <Table label="Kategori görüntüleme" rows={sorted(s.categories).map(([k, v]) => [catName.get(k) ?? k, v])} />
            </Section>
            <Section title="CTA tıklamaları" variant="card">
              <Table label="CTA tıklamaları" rows={sorted(s.ctas)} />
            </Section>
            <Section title="Cihaz (özellik sayfası)" variant="card">
              <Table label="Cihaz türü" rows={sorted(s.devices)} />
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
