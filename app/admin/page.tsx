import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import { formatKurusShort } from '@/lib/billing/pricing'
import { daysLeft } from '@/lib/plans'

export const metadata: Metadata = { title: 'Yönetim' }
export const dynamic = 'force-dynamic'

// KOÇ LİSTESİ VE ÖZET.
//
// ============================================================
// ÖĞRENCİ VERİSİ YOK — YALNIZ SAYI
//
// Bu ekranda öğrenci ADI, ödevi ya da ilerlemesi görünmüyor; yalnız KAÇ
// öğrencisi olduğu. Öğrenci sayısı bir faturalama bilgisidir, öğrencinin
// kim olduğu değil — ve o veri reşit olmayan kişilere ait.
//
// Kısıt arayüzde değil `admin_list_workspaces` RPC'sinde: fonksiyon o
// alanları zaten döndürmüyor. Arayüzde saklamak, veriyi tarayıcıya
// göndermiş olmak demekti.
// ============================================================

interface WorkspaceRow {
  workspace_id: string
  workspace_name: string
  owner_name: string | null
  owner_email: string | null
  created_at: string
  plan: string
  status: string
  active_students: number
  student_limit: number | null
  trial_ends_at: string | null
  license_ends_at: string | null
  total_paid_kurus: number
  partner_code: string | null
}

interface Overview {
  total_workspaces: number
  trial_workspaces: number
  licensed_workspaces: number
  total_students: number
  open_tickets: number
  revenue_kurus: number
}

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createClient()
  const { q } = await searchParams

  const [{ data: overviewRows }, { data: workspaceRows }] = await Promise.all([
    supabase.rpc('admin_overview'),
    supabase.rpc('admin_list_workspaces', { p_search: q || null, p_limit: 200 }),
  ])

  const overview = ((overviewRows ?? []) as unknown as Overview[])[0]
  const rows = (workspaceRows ?? []) as unknown as WorkspaceRow[]

  const stats = [
    { label: 'Çalışma alanı', value: String(overview?.total_workspaces ?? 0) },
    { label: 'Denemede', value: String(overview?.trial_workspaces ?? 0) },
    { label: 'Lisanslı', value: String(overview?.licensed_workspaces ?? 0) },
    { label: 'Aktif öğrenci', value: String(overview?.total_students ?? 0) },
    { label: 'Açık talep', value: String(overview?.open_tickets ?? 0) },
    { label: 'Toplam tahsilat', value: formatKurusShort(overview?.revenue_kurus ?? 0) },
  ]

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Koçlar</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Arama sunucu tarafında: GET formu, JavaScript gerektirmiyor
              ve adres çubuğunda paylaşılabilir bir sonuç bırakıyor. */}
          <form method="get" className="mb-4">
            <input
              type="search"
              name="q"
              defaultValue={q ?? ''}
              placeholder="Çalışma alanı, ad ya da e-posta ara…"
              aria-label="Koç ara"
              className="h-9 w-full max-w-sm rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </form>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Kayıt bulunamadı.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Çalışma alanı</th>
                    <th className="pb-2 font-medium">Sahip</th>
                    <th className="pb-2 font-medium">Kayıt</th>
                    <th className="pb-2 font-medium">Öğrenci</th>
                    <th className="pb-2 font-medium">Durum</th>
                    <th className="pb-2 font-medium">Kalan</th>
                    <th className="pb-2 font-medium">Tahsilat</th>
                    <th className="pb-2 font-medium">Partner</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isTrial = r.plan === 'trial'
                    const endsAt = isTrial ? r.trial_ends_at : r.license_ends_at
                    const left = daysLeft(endsAt)
                    return (
                      <tr key={r.workspace_id} className="border-b last:border-0">
                        <td className="py-2">{r.workspace_name}</td>
                        <td className="py-2">
                          <span className="block">{r.owner_name ?? '—'}</span>
                          <span className="block text-xs text-muted-foreground">
                            {r.owner_email ?? ''}
                          </span>
                        </td>
                        <td className="py-2 tabular-nums">
                          {new Date(r.created_at).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="py-2 tabular-nums">
                          {r.active_students}
                          {r.student_limit != null && (
                            <span className="text-muted-foreground">
                              {' '}
                              / {r.student_limit}
                            </span>
                          )}
                        </td>
                        <td className="py-2">
                          {r.status !== 'active' ? (
                            <Badge variant="destructive">{r.status}</Badge>
                          ) : isTrial ? (
                            <Badge variant="info">Deneme</Badge>
                          ) : r.plan === 'licensed' ? (
                            <Badge variant="success">Lisanslı</Badge>
                          ) : (
                            <Badge variant="neutral">{r.plan}</Badge>
                          )}
                        </td>
                        <td className="py-2 tabular-nums">
                          {left === null ? (
                            '—'
                          ) : left <= 0 ? (
                            <span className="text-destructive-foreground">Doldu</span>
                          ) : (
                            `${left} gün`
                          )}
                        </td>
                        <td className="py-2 tabular-nums">
                          {r.total_paid_kurus > 0
                            ? formatKurusShort(r.total_paid_kurus)
                            : '—'}
                        </td>
                        <td className="py-2">
                          {r.partner_code ? (
                            <code className="text-xs">{r.partner_code}</code>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
