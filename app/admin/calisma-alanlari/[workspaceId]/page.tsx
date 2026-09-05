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
// `admin_workspace_detail` RPC'sinde — fonksiyon öğrenci adı, ödev ya
// da mesaj gövdesi döndürmüyor.
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
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('admin_workspace_detail', {
    p_workspace_id: workspaceId,
  })

  // RPC yetkisiz çağrıda exception atıyor; layout zaten admin olmayanı
  // içeri almıyor. Buradaki hata pratikte "böyle bir kayıt yok" demek.
  if (error || !data) notFound()

  const detail = data as unknown as Detail
  const w = detail.workspace
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
        backHref="/admin"
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
