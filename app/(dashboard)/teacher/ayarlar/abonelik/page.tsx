import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getTeacherContext } from '@/lib/workspace'
import { PLANS, TRIAL_DAYS, trialDaysLeft } from '@/lib/plans'
import { formatKurus } from '@/lib/billing/pricing'
import { PlanPicker } from './plan-picker'
import { CancelSubscription } from './cancel-subscription'

export const metadata: Metadata = { title: 'Abonelik' }

// ABONELİK EKRANI.
//
// ÖDEME SONUCU BURADA URL PARAMETRESİNDEN OKUNMAZ. `?odeme=tamam`
// yalnız hangi bildirimin gösterileceğini söyler; gerçek durum her
// zaman veritabanından gelir. Aksi hâlde adres çubuğuna `?odeme=tamam`
// yazan herkes kendini abone sanırdı — ve daha kötüsü, gerçekten
// ödeyip parametresi kaybolan kullanıcı ödememiş görünürdü.

const PAYMENT_NOTICES: Record<string, { text: string; tone: 'success' | 'warning' | 'destructive' }> = {
  tamam: {
    text: 'Ödemeniz alındı. Aboneliğiniz aşağıda görünüyor.',
    tone: 'success',
  },
  basarisiz: {
    text: 'Ödeme tamamlanamadı. Kartınızdan tahsilat yapılmadıysa tekrar deneyebilirsiniz.',
    tone: 'destructive',
  },
  belirsiz: {
    // Bu mesaj bilinçli olarak temkinli: "başarısız" demek, parası
    // çekilmiş bir kullanıcıya yanlış bilgi vermek olurdu.
    text: 'Ödemenizin sonucu henüz doğrulanamadı. Birkaç dakika içinde bu sayfayı yenileyin; tahsilat yapıldıysa aboneliğiniz otomatik açılır. Sorun sürerse bize yazın.',
    tone: 'warning',
  },
  gecersiz: {
    text: 'Ödeme oturumu geçersiz ya da süresi dolmuş. Lütfen yeniden başlatın.',
    tone: 'warning',
  },
}

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ odeme?: string }>
}) {
  const { supabase, workspaceId, usage: rawUsage } = await getTeacherContext()
  const params = await searchParams

  // usage, RPC boş dönerse null olabilir. `!` ile susturmak yerine makul
  // bir varsayılana düşüyoruz: abonelik ekranının, kota bilgisi
  // okunamadı diye tamamen çökmesi doğru davranış değil — kullanıcı
  // buraya çoğu zaman ödeme yapmak için gelir.
  const usage = rawUsage ?? {
    plan: 'trial' as const,
    studentLimit: null,
    activeStudents: 0,
    trialEndsAt: null,
  }

  const notice = params.odeme ? PAYMENT_NOTICES[params.odeme] : undefined

  const [{ data: subscription }, { data: orders }] = await Promise.all([
    supabase
      .from('billing_subscriptions')
      .select('plan, period, status, current_period_end, cancel_at_period_end')
      .eq('workspace_id', workspaceId)
      .in('status', ['active', 'past_due'])
      .maybeSingle(),
    supabase
      .from('billing_orders')
      .select('id, plan, period, gross_kurus, status, created_at, paid_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const daysLeft = trialDaysLeft(usage.trialEndsAt)

  return (
    <div>
      <PageHeader
        title="Abonelik"
        subtitle="Planınızı yönetin, ödeme geçmişinizi görün."
      />

      {notice && (
        <div
          className={
            notice.tone === 'success'
              ? 'mb-6 rounded-md border border-success-border bg-success-subtle px-4 py-3 text-sm text-success-foreground'
              : notice.tone === 'destructive'
                ? 'mb-6 rounded-md border border-destructive-border bg-destructive-subtle px-4 py-3 text-sm text-destructive-foreground'
                : 'mb-6 rounded-md border border-warning-border bg-warning-subtle px-4 py-3 text-sm text-warning-foreground'
          }
          role="status"
        >
          {notice.text}
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mevcut durum</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {PLANS[usage.plan as keyof typeof PLANS]?.name ?? usage.plan}
              </span>
              {subscription?.status === 'active' && <Badge variant="success">Aktif</Badge>}
              {subscription?.status === 'past_due' && <Badge variant="warning">Ödeme bekliyor</Badge>}
              {usage.plan === 'trial' && <Badge variant="info">Deneme</Badge>}
            </div>

            <p className="text-muted-foreground">
              {usage.activeStudents} aktif öğrenci
              {usage.studentLimit != null && ` / ${usage.studentLimit} sınır`}
            </p>

            {subscription && (
              <p className="text-muted-foreground">
                {subscription.cancel_at_period_end
                  ? 'Aboneliğiniz iptal edildi; erişiminiz '
                  : 'Bir sonraki yenileme: '}
                <strong className="text-foreground">
                  {new Date(subscription.current_period_end).toLocaleDateString('tr-TR')}
                </strong>
                {subscription.cancel_at_period_end && ' tarihine kadar sürüyor.'}
              </p>
            )}

            {!subscription && usage.plan === 'trial' && (
              <p className="text-muted-foreground">
                {daysLeft != null && daysLeft > 0
                  ? `Deneme süreniz ${daysLeft} gün sonra doluyor.`
                  : `${TRIAL_DAYS} günlük deneme süreniz doldu.`}
              </p>
            )}
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-3 text-base font-medium">Plan seçin</h2>
          <PlanPicker currentPlan={usage.plan} />
        </div>

        {subscription && !subscription.cancel_at_period_end && (
          <CancelSubscription periodEnd={subscription.current_period_end} />
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ödeme geçmişi</CardTitle>
          </CardHeader>
          <CardContent>
            {!orders || orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz ödeme kaydı yok.</p>
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
                    {orders.map(order => (
                      <tr key={order.id} className="border-b last:border-0">
                        <td className="py-2 tabular-nums">
                          {new Date(order.created_at).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="py-2">
                          {PLANS[order.plan as keyof typeof PLANS]?.name ?? order.plan}{' '}
                          <span className="text-muted-foreground">
                            ({order.period === 'yearly' ? 'Yıllık' : 'Aylık'})
                          </span>
                        </td>
                        <td className="py-2 tabular-nums">{formatKurus(order.gross_kurus)}</td>
                        <td className="py-2">
                          {order.status === 'paid' ? (
                            <Badge variant="success">Ödendi</Badge>
                          ) : order.status === 'failed' ? (
                            <Badge variant="destructive">Başarısız</Badge>
                          ) : (
                            <Badge variant="neutral">Bekliyor</Badge>
                          )}
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
          Satın alma öncesi{' '}
          <Link href="/mesafeli-satis" className="text-primary underline underline-offset-4">
            mesafeli satış sözleşmesi
          </Link>
          ,{' '}
          <Link href="/on-bilgilendirme" className="text-primary underline underline-offset-4">
            ön bilgilendirme formu
          </Link>{' '}
          ve{' '}
          <Link href="/iade" className="text-primary underline underline-offset-4">
            iade koşulları
          </Link>{' '}
          geçerlidir.
        </p>
      </div>
    </div>
  )
}
