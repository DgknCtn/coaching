import type { Metadata } from 'next'
import Link from 'next/link'
import { Scale } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { SectionUnavailable } from '@/components/shared/section-unavailable'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import { formatDateTr, formatRelativeTr } from '@/lib/format'
import { daysLeft } from '@/lib/plans'
import type { SystemStatus } from '@/lib/admin/types'

export const metadata: Metadata = { title: 'Uyum' }
export const dynamic = 'force-dynamic'

// ============================================================
// UYUM (KVKK) — "yasal yükümlülükler yerine geliyor mu?"
//
// Silme talepleri (053) önceden hiçbir ekranda görünmüyordu; vadesi gelen
// bir talep ancak biri SQL'e bakarsa fark ediliyordu. admin_deletion_queue
// (124) öğrenci ADI döndürmez: kapsam "tek öğrenci" diye görünür. Talebi
// açan yalnız sahip ya da öğretmen olabilir (053), yani görünen ad bir
// öğretmen adıdır. Talep gerekçesi (reason) dönmez.
//
// Saklama kuralları: yalnız kodda ve belgede karşılığı olanlar yazılır.
// ============================================================

interface DeletionRow {
  request_id: string
  workspace_id: string
  workspace_name: string
  scope: 'workspace' | 'student'
  requested_by_name: string | null
  status: 'pending' | 'cancelled' | 'completed'
  execute_after: string
  created_at: string
}

const STATUS: Record<DeletionRow['status'], { label: string; variant: 'warning' | 'neutral' | 'success' }> = {
  pending: { label: 'Bekliyor', variant: 'warning' },
  cancelled: { label: 'İptal edildi', variant: 'neutral' },
  completed: { label: 'Yürütüldü', variant: 'success' },
}

export default async function AdminCompliance() {
  const supabase = await createClient()
  const [queueRes, systemRes] = await Promise.all([
    supabase.rpc('admin_deletion_queue'),
    supabase.rpc('admin_system_status'),
  ])
  const queue = queueRes.error ? null : ((queueRes.data ?? []) as DeletionRow[])
  const system = systemRes.error ? null : (systemRes.data as unknown as SystemStatus)
  const lastPurge = system?.cron.find((c) => c.job === 'purge-auth-events') ?? null
  const now = Date.now()
  const due = (queue ?? []).filter((d) => d.status === 'pending' && new Date(d.execute_after).getTime() <= now)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Uyum"
        subtitle="Silme talepleri ve kişisel veri saklama kuralları"
        className="mb-0"
      />

      <Section
        title="Silme talepleri"
        description={
          queue
            ? `${queue.filter((d) => d.status === 'pending').length} bekleyen · ${due.length} vadesi gelen. Bekleyenler üstte, vadesi yakın olan önce.`
            : undefined
        }
        variant="card"
      >
        {!queue ? (
          <div className="p-4">
            <SectionUnavailable title="Silme talepleri alınamadı" retryHref="/admin/uyum" />
          </div>
        ) : queue.length === 0 ? (
          <EmptyState icon={Scale} title="Silme talebi yok" />
        ) : (
          <>
            {due.length > 0 && (
              <p className="border-b bg-destructive/5 px-4 py-2 text-sm">
                {due.length} talebin 30 günlük bekleme süresi doldu. Panelden yürütme henüz yok; talep
                053&apos;teki kapsamla SQL Editor&apos;den yürütülmeli.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Çalışma alanı</th>
                    <th className="px-4 py-2 font-medium">Kapsam</th>
                    <th className="hidden px-4 py-2 font-medium md:table-cell">Talep eden</th>
                    <th className="px-4 py-2 font-medium">Durum</th>
                    <th className="px-4 py-2 font-medium">Yürütme</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((d) => {
                    const left = daysLeft(d.execute_after) ?? 0
                    const isDue = d.status === 'pending' && left <= 0
                    return (
                      <tr key={d.request_id} className="border-b last:border-0">
                        <td className="px-4 py-2">
                          <Link
                            href={`/admin/calisma-alanlari/${d.workspace_id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {d.workspace_name}
                          </Link>
                          <p className="text-xs text-muted-foreground">{formatRelativeTr(d.created_at)} açıldı</p>
                        </td>
                        <td className="px-4 py-2">
                          {d.scope === 'workspace' ? 'Tüm çalışma alanı' : 'Tek öğrenci'}
                        </td>
                        <td className="hidden px-4 py-2 text-muted-foreground md:table-cell">
                          {d.requested_by_name ?? '—'}
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={STATUS[d.status].variant}>{STATUS[d.status].label}</Badge>
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {formatDateTr(d.execute_after)}
                          {d.status === 'pending' && (
                            <p className={isDue ? 'text-xs font-medium text-destructive-foreground' : 'text-xs text-muted-foreground'}>
                              {isDue ? 'vadesi geldi' : `${left} gün kaldı`}
                            </p>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      <Section title="Saklama kuralları" variant="card">
        <dl className="divide-y text-sm">
          <div className="grid gap-1 p-4 sm:grid-cols-[16rem_1fr_auto] sm:items-center">
            <dt className="font-medium">Giriş kayıtlarında IP, şehir, cihaz</dt>
            <dd className="text-muted-foreground">90 gün sonra silinir; her gece çalışan temizlik (089, 122).</dd>
            <dd>
              {!system ? (
                <span className="text-muted-foreground">—</span>
              ) : system.purge_overdue > 0 || lastPurge?.ok === false ? (
                <Badge variant="destructive">
                  {system.purge_overdue > 0 ? `${system.purge_overdue} kayıt gecikmiş` : 'Son çalışma başarısız'}
                </Badge>
              ) : lastPurge ? (
                <Badge variant="success">Uyumlu · {formatRelativeTr(lastPurge.started_at)}</Badge>
              ) : (
                <Badge variant="warning">Henüz çalışmadı</Badge>
              )}
            </dd>
          </div>
          <div className="grid gap-1 p-4 sm:grid-cols-[16rem_1fr_auto] sm:items-center">
            <dt className="font-medium">Silme talepleri</dt>
            <dd className="text-muted-foreground">
              Talepten 30 gün sonra yürütülür; bu sürede sahip iptal edebilir (053).
            </dd>
            <dd>
              {queue ? (
                due.length > 0 ? (
                  <Badge variant="destructive">{due.length} vadesi geldi</Badge>
                ) : (
                  <Badge variant="success">Vadesi gelen yok</Badge>
                )
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </dd>
          </div>
          <div className="grid gap-1 p-4 sm:grid-cols-[16rem_1fr_auto] sm:items-center">
            <dt className="font-medium">Gece yedekleri</dt>
            <dd className="text-muted-foreground">
              30 gün saklanır; silinen veri en geç 30 gün sonra yedeklerden de çıkar. Buradan
              denetlenemiyor (bkz. Sistem).
            </dd>
            <dd>
              <Link href="/admin/sistem" className="text-xs underline underline-offset-2">
                Sistem
              </Link>
            </dd>
          </div>
        </dl>
      </Section>
    </div>
  )
}
