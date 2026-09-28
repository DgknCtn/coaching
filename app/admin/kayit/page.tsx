import type { Metadata } from 'next'
import Link from 'next/link'
import { ScrollText } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { SectionUnavailable } from '@/components/shared/section-unavailable'
import { EmptyState } from '@/components/shared/empty-state'
import { createClient } from '@/lib/supabase/server'
import { formatDateTimeTr } from '@/lib/format'
import { formatKurus } from '@/lib/billing/pricing'
import { adminActionLabel } from '@/lib/admin/action-schemas'

export const metadata: Metadata = { title: 'Yönetim kaydı' }
export const dynamic = 'force-dynamic'

// ============================================================
// YÖNETİM KAYDI — "kim ne yaptı?" (128)
//
// Panelden yapılan her işlem: kim, ne, hangi alanda, gerekçe, öncesi ve
// sonrası. Kayıt salt eklenir; UPDATE/DELETE/TRUNCATE tetikleyiciyle
// herkese kapalı. Bu sayfa yalnız okur.
// ============================================================

const PAGE_SIZE = 50

interface ActionRow {
  id: string
  created_at: string
  actor_name: string | null
  action: string
  workspace_id: string | null
  workspace_name: string | null
  target_id: string | null
  reason: string
  before: Record<string, unknown>
  after: Record<string, unknown>
  total: number
}

const FIELD_LABEL: Record<string, string> = {
  trial_ends_at: 'Deneme bitişi',
  license_ends_at: 'Lisans bitişi',
  student_limit: 'Öğrenci limiti',
  active_students: 'Aktif öğrenci',
  status: 'Durum',
  plan: 'Plan',
  days: 'Gün',
  months: 'Ay',
  student_count: 'Öğrenci',
  gross_kurus: 'Tutar',
}

const VALUE_LABEL: Record<string, string> = {
  active: 'aktif',
  suspended: 'askıda',
  trial: 'deneme',
  licensed: 'lisanslı',
  pending: 'bekliyor',
  paid: 'ödendi',
  failed: 'başarısız',
}

function show(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (key === 'gross_kurus') return formatKurus(Number(value))
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTimeTr(value)
  if (typeof value === 'string') return VALUE_LABEL[value] ?? value
  return String(value)
}

/** Sonrasında olan her alan: "önce → sonra"; yalnız öncede olan bağlam: "değer". */
function changes(before: Record<string, unknown>, after: Record<string, unknown>) {
  const keys = [...new Set([...Object.keys(after), ...Object.keys(before)])]
  return keys.map((k) => ({
    key: k,
    label: FIELD_LABEL[k] ?? k,
    text:
      k in after && k in before
        ? `${show(k, before[k])} → ${show(k, after[k])}`
        : show(k, k in after ? after[k] : before[k]),
  }))
}

export default async function AdminActionLog({
  searchParams,
}: {
  searchParams: Promise<{ sayfa?: string }>
}) {
  const page = Math.max(Number.parseInt((await searchParams).sayfa ?? '1', 10) || 1, 1)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_list_actions', {
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
    p_workspace_id: null,
  })
  const rows = error ? null : ((data ?? []) as ActionRow[])
  const total = rows?.[0]?.total ?? 0
  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Yönetim kaydı"
        subtitle="Panelden yapılan işlemler: kim, ne, nerede, neden. Kayıt değiştirilemez ve silinemez."
        className="mb-0"
      />

      <Section title={rows ? `${total} işlem` : undefined} variant="card">
        {!rows ? (
          <div className="p-4">
            <SectionUnavailable title="Yönetim kaydı alınamadı" retryHref="/admin/kayit" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="Henüz işlem yok"
            description="Müşteri detayından ya da Gelir sekmesinden yapılan işlemler burada görünür."
          />
        ) : (
          <ol className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="space-y-1.5 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p>
                    <span className="font-medium">{adminActionLabel(r.action)}</span>
                    {r.workspace_name && (
                      <>
                        {' · '}
                        {r.workspace_id ? (
                          <Link
                            href={`/admin/calisma-alanlari/${r.workspace_id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {r.workspace_name}
                          </Link>
                        ) : (
                          r.workspace_name
                        )}
                      </>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.actor_name ?? '—'} · {formatDateTimeTr(r.created_at)}
                  </p>
                </div>
                <p className="text-muted-foreground">“{r.reason}”</p>
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {changes(r.before, r.after).map((c) => (
                    <div key={c.key} className="flex gap-1">
                      <dt className="text-muted-foreground">{c.label}:</dt>
                      <dd className="tabular-nums">{c.text}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {pageCount > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Sayfalar">
          {page > 1 ? (
            <Link href={`/admin/kayit?sayfa=${page - 1}`} className="text-primary underline-offset-4 hover:underline">
              ← Önceki
            </Link>
          ) : (
            <span className="text-muted-foreground">← Önceki</span>
          )}
          <span className="tabular-nums text-muted-foreground">
            Sayfa {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={`/admin/kayit?sayfa=${page + 1}`} className="text-primary underline-offset-4 hover:underline">
              Sonraki →
            </Link>
          ) : (
            <span className="text-muted-foreground">Sonraki →</span>
          )}
        </nav>
      )}
    </div>
  )
}
