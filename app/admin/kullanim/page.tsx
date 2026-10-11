import type { Metadata } from 'next'
import Link from 'next/link'
import { Activity, Rocket } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { SectionUnavailable } from '@/components/shared/section-unavailable'
import { EmptyState } from '@/components/shared/empty-state'
import { DataTable, type Column } from '@/components/shared/data-table'
import { ActivationFunnel } from '@/components/admin/activation-funnel'
import { WindowPicker, parseWindow } from '@/components/admin/window-picker'
import { createClient } from '@/lib/supabase/server'
import { listResult } from '@/lib/data-result'
import { formatDateTr, formatRelativeTr } from '@/lib/format'
import { AUDIT_ACTION_LABEL, auditActionLabel } from '@/lib/audit'
import { lastReachedStep, type ActivationRow } from '@/lib/activation'
import type { FeatureUsage } from '@/lib/admin/types'

export const metadata: Metadata = { title: 'Kullanım' }
export const dynamic = 'force-dynamic'

// ============================================================
// KULLANIM — "ürün nasıl kullanılıyor?"
//
// Özellik hacmi audit_events'in eylem türlerinden (124): yalnız tür,
// sayı, kaç alanda ve son zaman — ayrıntı (detail) dönmüyor. Kütüphane
// alanı ve gezinme (workspace.switch) hariç.
//
// "Hiç kullanılmayanlar": etiketi olan ama bu aralıkta hiç kaydı olmayan
// eylemler. Boş bir satır da bilgidir — o özelliği kimse bulamıyor ya da
// kimse istemiyor olabilir.
//
// Aktivasyon hunisi (B17) buraya taşındı; eski /admin/aktivasyon adresi
// buraya yönlenir.
// ============================================================

// PİLOT — KOÇ BAŞINA (145, canlıya alma Faz 5.2). Yalnız sayılar.
interface PilotRow {
  workspace_id: string
  workspace_name: string
  students: number
  teacher_active_days: number
  members_total: number
  members_logged_in: number
  submitted: number
  approved: number
  pin_requests: number
}

const pilotColumns: Column<PilotRow>[] = [
  {
    key: 'name',
    header: 'Çalışma alanı',
    render: (r) => (
      <Link
        href={`/admin/calisma-alanlari/${r.workspace_id}`}
        className="font-medium underline-offset-4 hover:underline"
      >
        {r.workspace_name}
      </Link>
    ),
  },
  { key: 'days', header: 'Koç aktif gün', render: (r) => <span className="tabular-nums">{r.teacher_active_days}</span> },
  { key: 'students', header: 'Öğrenci', render: (r) => <span className="tabular-nums">{r.students}</span> },
  {
    key: 'members',
    header: 'Giren öğrenci/veli',
    // Oran, hesabı olan üyeler üzerinden: hesabı hiç verilmemiş öğrenci
    // "girmedi" sayılmaz, o ayrı bir kurulum eksiği.
    render: (r) => (
      <span className="tabular-nums">
        {r.members_logged_in} / {r.members_total}
      </span>
    ),
  },
  { key: 'submitted', header: 'Teslim', render: (r) => <span className="tabular-nums">{r.submitted}</span> },
  { key: 'approved', header: 'Onay', render: (r) => <span className="tabular-nums">{r.approved}</span> },
  {
    key: 'pin',
    header: 'PIN talebi',
    // Yüksekse giriş akışı kafa karıştırıyor demektir.
    render: (r) => <span className="tabular-nums">{r.pin_requests}</span>,
  },
]

export default async function AdminUsage({
  searchParams,
}: {
  searchParams: Promise<{ gun?: string }>
}) {
  const days = parseWindow((await searchParams).gun, 30)
  const supabase = await createClient()

  const [usageRes, funnelRes, pilotRes] = await Promise.all([
    supabase.rpc('admin_feature_usage', { p_days: days }),
    supabase.rpc('admin_activation_funnel', { p_days: days }),
    // 145: fonksiyon en fazla 90 gün kabul ediyor.
    supabase.rpc('admin_pilot_metrics', { p_days: Math.min(days, 90) }),
  ])
  const usageR = listResult(usageRes, 'admin.feature_usage')
  const funnelR = listResult(funnelRes, 'admin.activation_funnel')
  const pilotR = listResult(pilotRes, 'admin.pilot_metrics')
  const pilotRows = (pilotR.ok ? pilotR.data : []) as PilotRow[]
  const usage = (usageR.ok ? usageR.data : []) as unknown as FeatureUsage[]
  const funnelRows = (funnelR.ok ? funnelR.data : []) as ActivationRow[]

  const windowLabel = days === 365 ? 'son 1 yıl' : `son ${days} gün`
  const max = Math.max(1, ...usage.map((u) => u.total))
  const used = new Set(usage.map((u) => u.action))
  const unused = Object.keys(AUDIT_ACTION_LABEL)
    .filter((a) => a !== 'workspace.switch' && !used.has(a))
    .map((a) => AUDIT_ACTION_LABEL[a])
    .sort((x, y) => x.localeCompare(y, 'tr'))

  const funnelColumns: Column<ActivationRow>[] = [
    {
      key: 'name',
      header: 'Çalışma alanı',
      render: (r) => (
        <div>
          <Link
            href={`/admin/calisma-alanlari/${r.workspace_id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {r.workspace_name}
          </Link>
          <p className="text-xs text-muted-foreground">{formatDateTr(r.created_at)}</p>
        </div>
      ),
    },
    { key: 'last', header: 'Son ulaşılan adım', render: (r) => lastReachedStep(r) },
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="Kullanım"
          subtitle="Hangi özellik ne kadar kullanılıyor; yeni öğretmenler nerede takılıyor"
          className="mb-0"
        />
        <WindowPicker basePath="/admin/kullanim" value={days} />
      </div>

      <Section
        title="Pilot — koç başına"
        description={`${days > 90 ? 'son 90 gün' : windowLabel}. Aktif gün: koçun iz bıraktığı günler. Giren: bu aralıkta en az bir kez giriş yapan öğrenci/veli hesabı.`}
      >
        {!pilotR.ok ? (
          <SectionUnavailable title="Pilot metrikleri alınamadı" retryHref="/admin/kullanim" />
        ) : pilotRows.length === 0 ? (
          <EmptyState icon={Activity} title="Öğrencisi olan çalışma alanı yok" />
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <DataTable columns={pilotColumns} rows={pilotRows} rowKey={(r) => r.workspace_id} />
          </div>
        )}
      </Section>

      <Section
        title="Özellikler"
        description={`${windowLabel}, eylem türüne göre. Çubuk: en çok kullanılana göre.`}
        variant="card"
      >
        {!usageR.ok ? (
          <div className="p-4">
            <SectionUnavailable title="Kullanım verisi alınamadı" retryHref="/admin/kullanim" />
          </div>
        ) : usage.length === 0 ? (
          <EmptyState icon={Activity} title="Bu aralıkta kayıtlı eylem yok" />
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Özellik kullanımı, {windowLabel}</caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Eylem</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">
                  <span className="sr-only">Oran</span>
                </th>
                <th className="px-4 py-2 text-right font-medium">Sayı</th>
                <th className="hidden px-4 py-2 text-right font-medium md:table-cell">Alan</th>
                <th className="hidden px-4 py-2 font-medium lg:table-cell">Son</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.action} className="border-b last:border-0">
                  <td className="px-4 py-2">{auditActionLabel(u.action)}</td>
                  <td className="hidden w-1/3 px-4 py-2 sm:table-cell">
                    <span aria-hidden className="block h-2 rounded-full bg-muted">
                      <span
                        className="block h-2 rounded-full bg-chart-1"
                        style={{ width: `${(u.total / max) * 100}%` }}
                      />
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{u.total.toLocaleString('tr-TR')}</td>
                  <td className="hidden px-4 py-2 text-right tabular-nums md:table-cell">{u.workspaces}</td>
                  <td className="hidden px-4 py-2 text-muted-foreground lg:table-cell">
                    {formatRelativeTr(u.last_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {usageR.ok && unused.length > 0 && (
        <Section
          title="Bu aralıkta hiç kullanılmayanlar"
          description="Kaydı tutulan ama hiçbir alanda görülmeyen eylemler."
        >
          <ul className="flex flex-wrap gap-1.5 text-sm">
            {unused.map((label) => (
              <li key={label} className="rounded-md border px-2 py-0.5 text-muted-foreground">
                {label}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Aktivasyon hunisi"
        description={`${windowLabel} içinde açılan çalışma alanları: ${funnelRows.length}. Oran: bu alanlara göre; süre: açılıştan o adıma ortanca.`}
      >
        {!funnelR.ok ? (
          <SectionUnavailable title="Aktivasyon verisi alınamadı" retryHref="/admin/kullanim" />
        ) : funnelRows.length === 0 ? (
          <EmptyState icon={Rocket} title="Bu aralıkta açılan çalışma alanı yok" />
        ) : (
          <div className="space-y-6">
            <ActivationFunnel rows={funnelRows} />
            <div className="overflow-hidden rounded-lg border bg-card">
              <DataTable columns={funnelColumns} rows={funnelRows} rowKey={(r) => r.workspace_id} />
            </div>
          </div>
        )}
      </Section>
    </div>
  )
}
