import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getTeacherContext } from '@/lib/workspace'
import {
  daysLeft,
  licenseState,
  LICENSE_STATE_LABEL,
  TRIAL_DAYS,
  type WorkspaceUsage,
} from '@/lib/plans'
import { formatKurus } from '@/lib/billing/pricing'
import { LicensePurchase } from './license-purchase'

export const metadata: Metadata = { title: 'Lisans' }

// LİSANS DURUMU VE SATIN ALMA.
//
// ÖDEME SONUCU URL PARAMETRESİNDEN OKUNMAZ. `?odeme=tamam` yalnız hangi
// bildirimin gösterileceğini söyler; gerçek durum her zaman
// veritabanından gelir. Aksi hâlde adres çubuğuna `?odeme=tamam` yazan
// herkes kendini lisanslı sanırdı — ve daha kötüsü, gerçekten ödeyip
// parametresi kaybolan kullanıcı ödememiş görünürdü.

const PAYMENT_NOTICES: Record<
  string,
  { text: string; tone: 'success' | 'warning' | 'destructive' }
> = {
  tamam: { text: 'Ödemeniz alındı. Lisansınız aşağıda görünüyor.', tone: 'success' },
  basarisiz: {
    text: 'Ödeme tamamlanamadı. Kartınızdan tahsilat yapılmadıysa tekrar deneyebilirsiniz.',
    tone: 'destructive',
  },
  belirsiz: {
    // Bilinçli olarak temkinli: "başarısız" demek, parası çekilmiş bir
    // kullanıcıya yanlış bilgi vermek olurdu.
    text: 'Ödemenizin sonucu henüz doğrulanamadı. Birkaç dakika içinde bu sayfayı yenileyin; tahsilat yapıldıysa lisansınız otomatik açılır. Sorun sürerse bize yazın.',
    tone: 'warning',
  },
  gecersiz: {
    text: 'Ödeme oturumu geçersiz ya da süresi dolmuş. Lütfen yeniden başlatın.',
    tone: 'warning',
  },
}

const FALLBACK_USAGE: WorkspaceUsage = {
  plan: 'trial',
  studentLimit: null,
  activeStudents: 0,
  trialEndsAt: null,
  licenseStartsAt: null,
  licenseEndsAt: null,
  licenseStatus: null,
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export default async function LicensePage({
  searchParams,
}: {
  searchParams: Promise<{ odeme?: string }>
}) {
  const { supabase, workspaceId, usage: rawUsage } = await getTeacherContext()
  const params = await searchParams

  // usage, RPC boş dönerse null olabilir. `!` ile susturmak yerine makul
  // bir varsayılana düşüyoruz: bu sayfanın kota bilgisi okunamadı diye
  // tamamen çökmesi doğru değil — kullanıcı buraya çoğu zaman satın
  // almak için gelir.
  const usage = rawUsage ?? FALLBACK_USAGE
  const notice = params.odeme ? PAYMENT_NOTICES[params.odeme] : undefined

  const { data: orders } = await supabase
    .from('billing_orders')
    .select('id, student_count, months, gross_kurus, status, created_at, paid_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(10)

  const state = licenseState(usage)
  const isTrial = state === 'trialing' || state === 'trial_expired'
  const remainingDays = daysLeft(isTrial ? usage.trialEndsAt : usage.licenseEndsAt)

  const tone: Record<string, 'success' | 'warning' | 'destructive' | 'info' | 'neutral'> = {
    licensed: 'success',
    trialing: 'info',
    trial_expired: 'destructive',
    license_expired: 'destructive',
    unlimited: 'success',
  }

  return (
    <div>
      <PageHeader
        title="Lisans"
        subtitle="Lisans durumunuzu görün, öğrenci sayınıza ve sürenize göre satın alın."
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
        {/* DURUM PANELİ: dört bilgi tek bakışta — durum, dönem, kalan
            süre, öğrenci limiti. Ayrı yerlere dağıtmak, kullanıcıyı
            "lisansım ne zaman bitiyor" sorusu için gezdirirdi. */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mevcut durum</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Durum
                </dt>
                <dd className="mt-1.5">
                  <Badge variant={tone[state] ?? 'neutral'}>
                    {LICENSE_STATE_LABEL[state]}
                  </Badge>
                </dd>
              </div>

              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {isTrial ? 'Deneme dönemi' : 'Lisans dönemi'}
                </dt>
                <dd className="mt-1.5 text-sm">
                  {isTrial ? (
                    <>
                      {TRIAL_DAYS} gün · bitiş {formatDate(usage.trialEndsAt)}
                    </>
                  ) : usage.licenseStartsAt ? (
                    <>
                      {formatDate(usage.licenseStartsAt)} — {formatDate(usage.licenseEndsAt)}
                    </>
                  ) : (
                    'Süresiz'
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Kalan süre
                </dt>
                <dd className="mt-1.5 text-sm tabular-nums">
                  {remainingDays === null ? (
                    'Süresiz'
                  ) : remainingDays <= 0 ? (
                    <span className="font-medium text-destructive-foreground">Doldu</span>
                  ) : (
                    <span
                      className={
                        remainingDays <= 7 ? 'font-medium text-warning-foreground' : ''
                      }
                    >
                      {remainingDays} gün
                    </span>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Öğrenci limiti
                </dt>
                <dd className="mt-1.5 text-sm tabular-nums">
                  {usage.studentLimit === null ? (
                    'Sınırsız'
                  ) : (
                    <>
                      <strong className="font-medium">{usage.activeStudents}</strong> /{' '}
                      {usage.studentLimit}
                    </>
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-1 text-base font-medium">
            {state === 'licensed' ? 'Lisansı uzat veya genişlet' : 'Lisans al'}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {state === 'licensed'
              ? 'Yeni alım mevcut lisansınızın üstüne eklenir; kalan günlerinizi kaybetmezsiniz.'
              : 'Öğrenci sayınızı ve süreyi seçin. İkisi de arttıkça öğrenci başına maliyet düşer.'}
          </p>
          <LicensePurchase currentStudents={usage.activeStudents} />
        </div>

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
                      <th className="pb-2 font-medium">Lisans</th>
                      <th className="pb-2 font-medium">Tutar</th>
                      <th className="pb-2 font-medium">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b last:border-0">
                        <td className="py-2 tabular-nums">
                          {new Date(order.created_at).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="py-2">
                          {order.student_count} öğrenci · {order.months} ay
                        </td>
                        <td className="py-2 tabular-nums">
                          {formatKurus(order.gross_kurus)}
                        </td>
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
