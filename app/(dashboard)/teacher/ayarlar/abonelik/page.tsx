import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getTeacherContext } from '@/lib/workspace'
import {
  daysLeft,
  evaluateQuota,
  licenseState,
  LICENSE_STATE_LABEL,
  TRIAL_DAYS,
  type WorkspaceUsage,
} from '@/lib/plans'
import { ProgressBar } from '@/components/shared/progress-bar'
import { AlertTriangle } from 'lucide-react'
import { formatKurus } from '@/lib/billing/pricing'
import { formatDateTr } from '@/lib/format'
import { LicensePurchase } from './license-purchase'

export const metadata: Metadata = { title: 'Plan' }

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
  tamam: { text: 'Ödemeniz alındı. Planınız aşağıda görünüyor.', tone: 'success' },
  basarisiz: {
    text: 'Ödeme tamamlanamadı. Kartınızdan tahsilat yapılmadıysa tekrar deneyebilirsiniz.',
    tone: 'destructive',
  },
  belirsiz: {
    // Bilinçli olarak temkinli: "başarısız" demek, parası çekilmiş bir
    // kullanıcıya yanlış bilgi vermek olurdu.
    text: 'Ödemenizin sonucu henüz doğrulanamadı. Birkaç dakika içinde bu sayfayı yenileyin; tahsilat yapıldıysa planınız otomatik açılır. Sorun sürerse bize yazın.',
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
  const quota = evaluateQuota(usage)

  // ACİLİYET TEK YERDE TÜRETİLİR.
  //
  // Durum panelindeki "3 gün" rakamı doğruydu ama sessizdi: dört
  // kutudan biri, diğerleriyle aynı puntoda. Süresi dolmuş bir çalışma
  // alanının sahibi bu sayfaya zaten bir sorun yaşadığı için gelir; ne
  // yapması gerektiğini rozet okuyarak çıkarmak zorunda kalmamalı.
  const expired = state === 'trial_expired' || state === 'license_expired'
  const endingSoon = !expired && remainingDays !== null && remainingDays <= 7

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
        title="Plan"
        subtitle="Planınızı görün, öğrenci sayınıza ve sürenize göre yükseltin."
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

      {/* SÜRE UYARISI: ne olduğu + ne olacağı + nereye basılacağı tek
          kutuda. Bağlantı sayfa içindeki satın alma bölümüne iniyor;
          uzun bir sayfada "aşağıda bir yerde" demek, kullanıcıyı arama
          yapmaya bırakmaktır. */}
      {(expired || endingSoon) && (
        <div
          role="status"
          className={
            expired
              ? 'mb-6 flex items-start gap-2 rounded-md border border-destructive-border bg-destructive-subtle px-4 py-3 text-sm text-destructive-foreground'
              : 'mb-6 flex items-start gap-2 rounded-md border border-warning-border bg-warning-subtle px-4 py-3 text-sm text-warning-foreground'
          }
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {expired ? (
              <>
                {isTrial ? 'Deneme süreniz doldu' : 'Plan süreniz doldu'}. Verilerinizin
                hiçbiri silinmedi; bir plan aldığınızda kaldığınız yerden devam
                edersiniz.
              </>
            ) : (
              <>
                {isTrial ? 'Deneme sürenizin' : 'Planınızın'} bitmesine{' '}
                <strong className="font-medium tabular-nums">{remainingDays} gün</strong>{' '}
                kaldı. Süre dolduğunda çalışma alanı erişime kapanır.
              </>
            )}{' '}
            <a href="#plan-olustur" className="font-medium underline underline-offset-4">
              {expired ? 'Plan alın' : 'Şimdi uzatın'}
            </a>
          </span>
        </div>
      )}

      <div className="space-y-6">
        {/* DURUM PANELİ: dört bilgi tek bakışta — durum, dönem, kalan
            süre, öğrenci limiti. Ayrı yerlere dağıtmak, kullanıcıyı
            "planım ne zaman bitiyor" sorusu için gezdirirdi. */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mevcut planınız</CardTitle>
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
                  {isTrial ? 'Deneme dönemi' : 'Plan dönemi'}
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
                      {/* ÇUBUK, İKİ SAYIYI TEK BAKIŞA ÇEVİRİR: "18 / 20"
                          okunup hesaplanması gereken bir şey; dolmuş bir
                          çubuk bakılır bakılmaz anlaşılır. Yalnız limitli
                          alanlarda çizilir — sınırsızda dolmayan bir
                          çubuk, olmayan bir tavanı varmış gibi gösterir. */}
                      <ProgressBar
                        className="mt-2"
                        value={quota.usedPercentage ?? 0}
                        label="Öğrenci kotası kullanımı"
                        tone={
                          quota.atLimit
                            ? 'destructive'
                            : quota.isNearLimit
                              ? 'warning'
                              : 'primary'
                        }
                      />
                    </>
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div id="plan-olustur" className="scroll-mt-6">
          <h2 className="mb-1 text-base font-medium">
            {state === 'licensed'
              ? 'Planınızı uzatın veya genişletin'
              : 'Planınızı oluşturun'}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {state === 'licensed'
              ? 'Yeni alım mevcut planınızın üstüne eklenir; kalan günlerinizi kaybetmezsiniz.'
              : 'Öğrenci sayınızı ve kullanım sürenizi seçin. Uzun süreli kullanımda öğrenci başına maliyetiniz düşer.'}
          </p>
          <LicensePurchase currentStudents={usage.activeStudents} />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Siparişleriniz</CardTitle>
          </CardHeader>
          <CardContent>
            {!orders || orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz sipariş kaydınız yok.</p>
            ) : (
              <>
                {/* MOBİLDE TABLO DEĞİL KART.
                    Dört sütunluk tablo telefonda yatay kaydırma
                    gerektiriyordu: kullanıcı tutarı görmek için sağa
                    kaydırıyor, kaydırınca hangi siparişe baktığını
                    kaybediyordu. Aynı veri, aynı sıra — yalnız dizilim
                    dikey. */}
                <ul className="space-y-3 sm:hidden">
                  {orders.map((order) => (
                    <li key={order.id} className="rounded-md border p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium tabular-nums">
                            {formatKurus(order.gross_kurus)}
                          </p>
                          <p className="mt-0.5 text-muted-foreground">
                            {order.student_count} öğrenci · {order.months} ay
                          </p>
                        </div>
                        {order.status === 'paid' ? (
                          <Badge variant="success">Ödendi</Badge>
                        ) : order.status === 'failed' ? (
                          <Badge variant="destructive">Başarısız</Badge>
                        ) : order.status === 'cancelled' ? (
                          <Badge variant="neutral">İptal edildi</Badge>
                        ) : (
                          <Badge variant="warning">Ödeme tamamlanmadı</Badge>
                        )}
                      </div>
                      <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                        {formatDateTr(order.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>

                <div className="hidden overflow-x-auto sm:block">
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
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b last:border-0">
                        <td className="py-2 tabular-nums">
                          {formatDateTr(order.created_at)}
                        </td>
                        <td className="py-2">
                          {order.student_count} öğrenci · {order.months} ay
                        </td>
                        <td className="py-2 tabular-nums">
                          {formatKurus(order.gross_kurus)}
                        </td>
                        {/* İPTAL EDİLEN SİPARİŞ "BEKLİYOR" DEMEZ.
                            Önceden pending ve cancelled aynı rozeti
                            alıyordu; kullanıcı ödemediği bir tutarın
                            kendisinden hâlâ beklendiğini sanıyordu. */}
                        <td className="py-2">
                          {order.status === 'paid' ? (
                            <Badge variant="success">Ödendi</Badge>
                          ) : order.status === 'failed' ? (
                            <Badge variant="destructive">Başarısız</Badge>
                          ) : order.status === 'cancelled' ? (
                            <Badge variant="neutral">İptal edildi</Badge>
                          ) : (
                            <Badge variant="warning">Ödeme tamamlanmadı</Badge>
                          )}
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
