import type { Metadata } from 'next'
import { Rocket } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { EmptyState } from '@/components/shared/empty-state'
import { DataTable, type Column } from '@/components/shared/data-table'
import { SectionUnavailable } from '@/components/shared/section-unavailable'
import { createClient } from '@/lib/supabase/server'
import { listResult } from '@/lib/data-result'
import { formatDateTr } from '@/lib/format'
import {
  activationFunnel,
  formatHours,
  lastReachedStep,
  type ActivationRow,
} from '@/lib/activation'

export const metadata: Metadata = { title: 'Aktivasyon' }
export const dynamic = 'force-dynamic'

// AKTİVASYON (B17 · 120).
//
// NE CEVAPLAR: kayıt olan öğretmenlerin kaçı gerçekten kullanmaya
// başlıyor ve NEREDE takılıyor. Kilometre taşları var olan tablolardan
// türetiliyor (yeni olay kaydı yok); öğrenci verisi dönmüyor.
//
// "10 saniye testi" (PRD) bir kullanıcı araştırmasıdır — gerçek koçlarla
// yapılır, bu ekranın konusu değil. Bu ekran onun yerine geçmez; hangi
// adımda kayıp olduğunu göstererek o araştırmanın NEREYE bakacağını söyler.

const WINDOWS = [30, 90, 365] as const

export default async function ActivationPage({
  searchParams,
}: {
  searchParams: Promise<{ gun?: string }>
}) {
  const requested = Number((await searchParams).gun)
  const days = (WINDOWS as readonly number[]).includes(requested) ? requested : 90

  const supabase = await createClient()
  const result = listResult(
    await supabase.rpc('admin_activation_funnel', { p_days: days }),
    'admin.activation_funnel'
  )

  const rows = (result.ok ? result.data : []) as ActivationRow[]
  const funnel = activationFunnel(rows)

  const columns: Column<ActivationRow>[] = [
    {
      key: 'name',
      header: 'Çalışma alanı',
      render: (r) => (
        <div>
          <p className="font-medium">{r.workspace_name}</p>
          <p className="text-xs text-muted-foreground">{formatDateTr(r.created_at)}</p>
        </div>
      ),
    },
    { key: 'last', header: 'Son ulaşılan adım', render: (r) => lastReachedStep(r) },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aktivasyon"
        subtitle={`Son ${days} günde açılan çalışma alanları: ${rows.length}`}
      />

      <nav aria-label="Zaman aralığı" className="flex gap-2 text-sm">
        {WINDOWS.map((w) => (
          <a
            key={w}
            href={`/admin/aktivasyon?gun=${w}`}
            aria-current={w === days ? 'page' : undefined}
            className={
              w === days
                ? 'rounded-md border border-primary bg-primary/10 px-3 py-1 font-medium'
                : 'rounded-md border px-3 py-1 text-muted-foreground hover:text-foreground'
            }
          >
            {w} gün
          </a>
        ))}
      </nav>

      {!result.ok ? (
        <SectionUnavailable title="Aktivasyon verisi alınamadı" retryHref="/admin/aktivasyon" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Rocket} title="Bu aralıkta açılan çalışma alanı yok" />
      ) : (
        <>
          <Section title="Huni" description="Oran: bu aralıkta açılan alanlara göre. Süre: açılıştan o adıma ortanca.">
            <ol className="space-y-2">
              {funnel.map((step) => (
                <li key={step.key} className="grid grid-cols-[10rem_1fr_auto] items-center gap-3 text-sm max-sm:grid-cols-1">
                  <span>{step.label}</span>
                  <div
                    className="h-2.5 overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`${step.label}: yüzde ${step.percent}`}
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${step.percent}%` }} />
                  </div>
                  <span className="tabular-nums text-muted-foreground">
                    {step.reached} · %{step.percent}
                    {step.key !== 'created' && ` · ${formatHours(step.medianHours)}`}
                  </span>
                </li>
              ))}
            </ol>
          </Section>

          <Section title="Alanlar" variant="card">
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.workspace_id} />
          </Section>
        </>
      )}
    </div>
  )
}
