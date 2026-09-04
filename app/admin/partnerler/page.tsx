import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import { formatKurus } from '@/lib/billing/pricing'
import { MarkPaidButton } from './mark-paid-button'

export const metadata: Metadata = { title: 'Partnerler' }
export const dynamic = 'force-dynamic'

// PARTNER YÖNETİMİ.
//
// Partner kodları BURADAN OLUŞTURULMUYOR: yeni partner eklemek bir
// anlaşma sonucu ve nadir bir işlem. Arayüzden eklenebilseydi, yanlışlıkla
// oluşturulan bir kod komisyon yükümlülüğü doğururdu. Kod veritabanından
// elle eklenir:
//
//   INSERT INTO public.partners (code, name, email)
//   VALUES ('ORNEK1', 'Ad Soyad', 'eposta@ornek.com');

interface PartnerRow {
  partner_id: string
  code: string
  name: string
  email: string | null
  commission_rate: number
  status: string
  referral_count: number
  paying_count: number
  total_kurus: number
  unpaid_kurus: number
}

export default async function AdminPartnersPage() {
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_list_partners')
  const rows = (data ?? []) as unknown as PartnerRow[]

  const totalUnpaid = rows.reduce((sum, r) => sum + Number(r.unpaid_kurus ?? 0), 0)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Partnerler{' '}
            <span className="font-normal text-muted-foreground">({rows.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Henüz partner yok. Yeni partner veritabanından eklenir.
            </p>
          ) : (
            <>
              {totalUnpaid > 0 && (
                <p className="mb-4 rounded-md border border-warning-border bg-warning-subtle px-4 py-2.5 text-sm text-warning-foreground">
                  Ödenmemiş toplam hakediş:{' '}
                  <strong className="font-medium tabular-nums">
                    {formatKurus(totalUnpaid)}
                  </strong>
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Kod</th>
                      <th className="pb-2 font-medium">Partner</th>
                      <th className="pb-2 font-medium">Oran</th>
                      <th className="pb-2 font-medium">Getirdiği</th>
                      <th className="pb-2 font-medium">Ödeyen</th>
                      <th className="pb-2 font-medium">Toplam hakediş</th>
                      <th className="pb-2 font-medium">Ödenmemiş</th>
                      <th className="pb-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.partner_id} className="border-b last:border-0">
                        <td className="py-2">
                          <code className="text-xs">{r.code}</code>
                        </td>
                        <td className="py-2">
                          <span className="block">{r.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {r.email ?? ''}
                          </span>
                        </td>
                        <td className="py-2 tabular-nums">
                          %{Math.round(Number(r.commission_rate) * 100)}
                        </td>
                        <td className="py-2 tabular-nums">{r.referral_count}</td>
                        <td className="py-2 tabular-nums">{r.paying_count}</td>
                        <td className="py-2 tabular-nums">
                          {formatKurus(Number(r.total_kurus))}
                        </td>
                        <td className="py-2 tabular-nums">
                          {Number(r.unpaid_kurus) > 0 ? (
                            <strong className="font-medium">
                              {formatKurus(Number(r.unpaid_kurus))}
                            </strong>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2 text-right">
                          {r.status !== 'active' ? (
                            <Badge variant="neutral">Askıda</Badge>
                          ) : Number(r.unpaid_kurus) > 0 ? (
                            <MarkPaidButton
                              partnerId={r.partner_id}
                              partnerName={r.name}
                              amount={formatKurus(Number(r.unpaid_kurus))}
                            />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Hakediş, KDV hariç tutar üzerinden hesaplanır. &quot;Ödendi işaretle&quot; yalnız
        kaydı günceller; para transferi elle yapılır.
      </p>
    </div>
  )
}
