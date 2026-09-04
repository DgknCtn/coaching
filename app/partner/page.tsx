import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import { formatKurus } from '@/lib/billing/pricing'
import { BRAND } from '@/lib/brand'
import { ReferralLink } from './referral-link'

export const metadata: Metadata = { title: 'Partner Paneli' }
export const dynamic = 'force-dynamic'

// PARTNER PANELİ.
//
// ============================================================
// PARTNER, KİRACININ VERİSİNE ORTAK DEĞİL
//
// Burada gösterilen her şey `get_partner_referrals()` RPC'sinden gelir
// ve o fonksiyon bilinçli olarak DAR: çalışma alanı adı, tarih, hakediş.
// Öğrenci adı, öğrenci sayısı, ödeme tutarı ve kullanıcı e-postası YOK.
//
// Partner bir satış ortağı; getirdiği müşterinin öğrencilerini görmesi
// için hiçbir sebep yok ve o veriler reşit olmayan kişilere ait.
// ============================================================

export default async function PartnerPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Partner kaydı yoksa burada işi yok. Rol workspace üyeliğinden
  // bağımsız olduğu için middleware'de değil burada kontrol ediliyor.
  const { data: partner } = await supabase
    .from('partners')
    .select('code, name, commission_rate, status')
    .maybeSingle()

  if (!partner) redirect('/')

  const { data: referrals } = await supabase.rpc('get_partner_referrals')
  const rows = (referrals ?? []) as {
    workspace_name: string
    referred_at: string | null
    has_purchased: boolean
    commission_kurus: number
    commission_status: string | null
  }[]

  const total = rows.reduce((sum, r) => sum + Number(r.commission_kurus ?? 0), 0)
  const paid = rows
    .filter((r) => r.commission_status === 'paid')
    .reduce((sum, r) => sum + Number(r.commission_kurus ?? 0), 0)
  const purchased = rows.filter((r) => r.has_purchased).length

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">
          {BRAND.name} Partner
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Merhaba, {partner.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kodunuzla kaydolanları ve hakedişinizi buradan takip edersiniz.
        </p>
      </header>

      <div className="space-y-6">
        <ReferralLink code={partner.code} rate={Number(partner.commission_rate)} />

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Kaydolan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{rows.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Lisans alan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{purchased}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Toplam hakediş
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{formatKurus(total)}</p>
              {paid > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatKurus(paid)} ödendi
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Kodunuzla kaydolanlar</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Henüz kimse kodunuzla kaydolmadı. Yukarıdaki bağlantıyı paylaşarak
                başlayabilirsiniz.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Çalışma alanı</th>
                      <th className="pb-2 font-medium">Kayıt</th>
                      <th className="pb-2 font-medium">Durum</th>
                      <th className="pb-2 font-medium">Hakediş</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2">{r.workspace_name}</td>
                        <td className="py-2 tabular-nums">
                          {r.referred_at
                            ? new Date(r.referred_at).toLocaleDateString('tr-TR')
                            : '—'}
                        </td>
                        <td className="py-2">
                          {!r.has_purchased ? (
                            <Badge variant="neutral">Denemede</Badge>
                          ) : r.commission_status === 'paid' ? (
                            <Badge variant="success">Ödendi</Badge>
                          ) : (
                            <Badge variant="info">Hakediş bekliyor</Badge>
                          )}
                        </td>
                        <td className="py-2 tabular-nums">
                          {r.has_purchased ? formatKurus(Number(r.commission_kurus)) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Hakediş, KDV hariç tutar üzerinden hesaplanır. Ödemeler elle yapılır;
          sorularınız için bize yazabilirsiniz.
        </p>
      </div>
    </div>
  )
}
