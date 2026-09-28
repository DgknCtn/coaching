import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { createClient } from '@/lib/supabase/server'
import { formatKurus, formatKurusShort } from '@/lib/billing/pricing'
import { daysLeft, planLabel, workspaceStatusLabel } from '@/lib/plans'
import { formatDateTr, formatRelativeTr } from '@/lib/format'
import { auditActionLabel } from '@/lib/audit'
import { Section } from '@/components/shared/section'
import { SectionUnavailable } from '@/components/shared/section-unavailable'
import { KpiCard } from '@/components/admin/kpi-card'
import { TrendChart } from '@/components/admin/charts/trend-chart'
import { WindowPicker, parseWindow } from '@/components/admin/window-picker'
import { dayLabel, type WorkspaceActivity } from '@/lib/admin/types'

export const metadata: Metadata = { title: 'Çalışma Alanı' }
export const dynamic = 'force-dynamic'

// MÜŞTERİ 360°.
//
// ============================================================
// NEDEN AYRI BİR EKRAN
//
// Listedeki satır "bu müşteri var" diyor; burası "bu müşteride ne
// oluyor" diyor. Yönetici bir çalışma alanıyla ilgilendiğinde aradığı
// şeyler dağınıktı: planı abonelik tablosunda, ödemeleri sipariş
// listesinde, talepleri destek ekranında, kullanımı hiçbir yerde.
//
// ÖĞRENCİ VERİSİ YOK: yalnız sayı. Sınır arayüzde değil
// `admin_workspace_detail` ve `admin_workspace_activity` (124) RPC'lerinde
// — fonksiyonlar öğrenci adı, ödev ya da mesaj gövdesi döndürmüyor.
// Öğretmenler adıyla görünür (kullanıcı kararı, 27 Eylül 2026).
// ============================================================

interface Detail {
  workspace: {
    id: string
    name: string
    type: string
    status: string
    plan: string
    created_at: string
    trial_ends_at: string | null
    student_limit: number | null
    active_students: number
    last_activity_at: string | null
  }
  owner: { name: string | null; email: string | null }
  license: {
    student_count: number
    starts_at: string
    ends_at: string
    status: string
  } | null
  partner: { code: string; name: string } | null
  totals: { paid_kurus: number; pending_kurus: number; open_tickets: number }
  orders: {
    id: string
    student_count: number
    months: number
    gross_kurus: number
    status: string
    created_at: string
    paid_at: string | null
  }[]
}

const MEMBER_ROLE_LABEL: Record<string, string> = {
  owner: 'Sahip',
  teacher: 'Öğretmen',
}

const WORKSPACE_TYPE_LABEL: Record<string, string> = {
  individual: 'Bireysel',
  institution: 'Kurum',
}

function orderBadge(status: string) {
  if (status === 'paid') return <Badge variant="success">Ödendi</Badge>
  if (status === 'failed') return <Badge variant="destructive">Başarısız</Badge>
  if (status === 'cancelled') return <Badge variant="neutral">İptal edildi</Badge>
  return <Badge variant="warning">Ödeme tamamlanmadı</Badge>
}

export default async function AdminWorkspaceDetail({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ gun?: string }>
}) {
  const { workspaceId } = await params
  const days = parseWindow((await searchParams).gun, 30)
  const supabase = await createClient()

  // Etkinlik ayrı sorgu: düşerse sayfa değil yalnız o bölümler "alınamadı" der.
  const [{ data, error }, activityRes] = await Promise.all([
    supabase.rpc('admin_workspace_detail', { p_workspace_id: workspaceId }),
    supabase.rpc('admin_workspace_activity', { p_workspace_id: workspaceId, p_days: days }),
  ])

  // RPC yetkisiz çağrıda exception atıyor; layout zaten admin olmayanı
  // içeri almıyor. Buradaki hata pratikte "böyle bir kayıt yok" demek.
  if (error || !data) notFound()

  const detail = data as unknown as Detail
  const w = detail.workspace
  const activity = activityRes.error ? null : (activityRes.data as unknown as WorkspaceActivity)
  const selfHref = `/admin/calisma-alanlari/${workspaceId}`
  const windowLabel = days === 365 ? 'son 1 yıl' : `son ${days} gün`
  const actionMax = Math.max(1, ...(activity?.actions ?? []).map((a) => a.total))

  const left = daysLeft(w.plan === 'trial' ? w.trial_ends_at : (detail.license?.ends_at ?? null))

  const statusBadge =
    w.status !== 'active' ? (
      <Badge variant="destructive">{workspaceStatusLabel(w.status)}</Badge>
    ) : w.plan === 'trial' ? (
      <Badge variant="info">Deneme</Badge>
    ) : w.plan === 'licensed' ? (
      <Badge variant="success">Plan aktif</Badge>
    ) : (
      <Badge variant="neutral">{planLabel(w.plan)}</Badge>
    )

  return (
    <div>
      <PageHeader
        title={w.name}
        subtitle={detail.owner.name ?? detail.owner.email ?? undefined}
        backHref="/admin/musteriler"
        badges={statusBadge}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Genel bakış</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Sahip" value={detail.owner.name ?? '—'} />
              <Field label="E-posta" value={detail.owner.email ?? '—'} />
              <Field label="Hesap tipi" value={WORKSPACE_TYPE_LABEL[w.type] ?? w.type} />
              <Field label="Kayıt" value={formatDateTr(w.created_at)} />
              <Field
                label="Öğrenci"
                value={
                  w.student_limit != null
                    ? `${w.active_students} / ${w.student_limit}`
                    : String(w.active_students)
                }
              />
              <Field label="Son aktivite" value={formatRelativeTr(w.last_activity_at)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Plan</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.license ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Öğrenci hakkı" value={String(detail.license.student_count)} />
                <Field label="Başlangıç" value={formatDateTr(detail.license.starts_at)} />
                <Field label="Bitiş" value={formatDateTr(detail.license.ends_at)} />
                <Field
                  label="Kalan"
                  value={left === null ? '—' : left <= 0 ? 'Doldu' : `${left} gün`}
                />
              </dl>
            ) : w.plan === 'trial' ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Durum" value="Deneme sürüyor" />
                <Field label="Deneme bitişi" value={formatDateTr(w.trial_ends_at)} />
                <Field
                  label="Kalan"
                  value={left === null ? '—' : left <= 0 ? 'Doldu' : `${left} gün`}
                />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Aktif plan yok.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ödemeler</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="mb-4 grid gap-4 sm:grid-cols-2">
              <Field label="Toplam tahsilat" value={formatKurusShort(detail.totals.paid_kurus)} />
              <Field
                label="Bekleyen"
                value={
                  detail.totals.pending_kurus > 0
                    ? formatKurusShort(detail.totals.pending_kurus)
                    : '—'
                }
              />
            </dl>

            {detail.orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz sipariş yok.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Tarih</th>
                      <th className="pb-2 font-medium">Plan</th>
                      <th className="pb-2 font-medium">Tutar</th>
                      <th className="pb-2 font-medium">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.orders.map((o) => (
                      <tr key={o.id} className="border-b last:border-0">
                        <td className="py-2 tabular-nums">{formatDateTr(o.created_at)}</td>
                        <td className="py-2">
                          {o.student_count} öğrenci · {o.months} ay
                        </td>
                        <td className="py-2 tabular-nums">{formatKurus(o.gross_kurus)}</td>
                        <td className="py-2">{orderBadge(o.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* BAŞARISIZ ÖDEMELER: nedeni (billing_orders.failure_reason)
                önceden hiçbir ekranda görünmüyordu. */}
            {activity && activity.failed_orders.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Başarısız ödemeler
                </p>
                <ul className="space-y-1.5 text-sm">
                  {activity.failed_orders.map((o) => (
                    <li key={o.at} className="flex flex-wrap justify-between gap-x-3">
                      <span>
                        <span className="tabular-nums">{formatKurus(o.kurus)}</span>{' '}
                        <span className="text-muted-foreground">
                          · {o.reason ?? 'neden kaydedilmemiş'}
                        </span>
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatDateTr(o.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Destek ve partner</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Açık talep
                </dt>
                <dd className="mt-1.5 text-sm">
                  {detail.totals.open_tickets > 0 ? (
                    <Link href="/admin/talepler" className="underline underline-offset-2">
                      {detail.totals.open_tickets} açık talep
                    </Link>
                  ) : (
                    'Yok'
                  )}
                </dd>
              </div>
              <Field
                label="Partner"
                value={
                  detail.partner ? `${detail.partner.name} (${detail.partner.code})` : 'Yok'
                }
              />
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="mt-10 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold">Kullanım</h2>
          <WindowPicker basePath={selfHref} value={days} />
        </div>

        {activity ? (
          <>
            <Section
              title="Kişiler"
              description="Öğrenci ve veli yalnız sayı olarak görünür. Aktif: son 7 günde teslim eden."
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Öğrenci"
                  value={activity.counts.students}
                  hint={`${activity.counts.students_with_account} hesaplı`}
                />
                <KpiCard
                  label="Aktif öğrenci (7 gün)"
                  value={
                    activity.counts.students > 0
                      ? `%${Math.round((activity.counts.active_students_7d / activity.counts.students) * 100)}`
                      : '—'
                  }
                  hint={`${activity.counts.active_students_7d} / ${activity.counts.students}`}
                />
                <KpiCard label="Veli" value={activity.counts.parents} />
                <KpiCard
                  label="Açık müdahale"
                  value={activity.counts.open_interventions}
                  tone={activity.counts.open_interventions > 0 ? 'warning' : 'default'}
                />
              </div>
            </Section>

            <Section title="Ödev akışı" description={`${windowLabel}, günlük`}>
              <div className="grid gap-4 lg:grid-cols-3">
                {(
                  [
                    ['Verilen ödev', 'published', 'bar'],
                    ['Öğrenci teslimi', 'submitted', 'line'],
                    ['Öğretmen onayı', 'approved', 'line'],
                  ] as const
                ).map(([title, key, kind]) => (
                  <div key={key} className="rounded-lg border bg-card p-4">
                    <p className="mb-2 flex items-baseline justify-between gap-2 text-sm font-medium">
                      {title}
                      <span className="text-xs font-normal tabular-nums text-muted-foreground">
                        toplam{' '}
                        {activity.daily.reduce((s, d) => s + Number(d[key]), 0).toLocaleString('tr-TR')}
                      </span>
                    </p>
                    <TrendChart
                      title={title}
                      kind={kind}
                      data={activity.daily.map((d) => ({ label: dayLabel(d.day), value: Number(d[key]) }))}
                    />
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Öğretmenler" variant="card">
              {activity.teachers.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Aktif öğretmen üyesi yok.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Ad</th>
                        <th className="px-4 py-2 font-medium">Rol</th>
                        <th className="px-4 py-2 font-medium">Son giriş</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity.teachers.map((t) => (
                        <tr key={`${t.email}-${t.role}`} className="border-b last:border-0">
                          <td className="px-4 py-2">
                            <p>{t.name ?? '—'}</p>
                            {t.email && <p className="text-xs text-muted-foreground">{t.email}</p>}
                          </td>
                          <td className="px-4 py-2">{MEMBER_ROLE_LABEL[t.role] ?? t.role}</td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {t.last_login_at ? formatRelativeTr(t.last_login_at) : 'kayıt yok'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* EYLEM HACMİ: audit_events'ten yalnız tür ve sayı — ayrıntı
                (detail) fonksiyondan hiç dönmüyor. */}
            <Section title="Eylemler" description={`${windowLabel}, türe göre`} variant="card">
              {activity.actions.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Bu dönemde kayıtlı eylem yok.</p>
              ) : (
                <ul className="divide-y">
                  {activity.actions.map((a) => (
                    <li
                      key={a.action}
                      className="grid grid-cols-[1fr_auto] items-center gap-x-4 px-4 py-2 text-sm sm:grid-cols-[14rem_1fr_auto]"
                    >
                      <span className="truncate">{auditActionLabel(a.action)}</span>
                      <span aria-hidden className="hidden h-2 rounded-full bg-muted sm:block">
                        <span
                          className="block h-2 rounded-full bg-chart-1"
                          style={{ width: `${(a.total / actionMax) * 100}%` }}
                        />
                      </span>
                      <span className="tabular-nums">{a.total.toLocaleString('tr-TR')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        ) : (
          <SectionUnavailable title="Kullanım verisi alınamadı" retryHref={selfHref} />
        )}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 text-sm">{value}</dd>
    </div>
  )
}
