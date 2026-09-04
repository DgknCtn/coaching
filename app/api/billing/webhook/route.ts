import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  verifyWebhookSignature,
  retrieveSubscription,
  type SubscriptionWebhookPayload,
} from '@/lib/billing/iyzico-subscription'
import { planFromReferenceCode } from '@/lib/billing/plan-codes'
import { priceFor } from '@/lib/billing/pricing'

// ABONELİK WEBHOOK'U — otomatik tahsilatın bize ulaştığı tek kapı.
//
// ============================================================
// TEHDİT: BU UÇ HERKESE AÇIK
//
// Sağlayıcı, yenileme ödemesi başarılı ya da başarısız olduğunda buraya
// POST atar. Yani uç internete açık ve gövdesi tamamen istemci
// kontrolünde. "subscription.order.success" yazan bir gövdeye inanmak,
// herkese bedava abonelik dağıtmaktır.
//
// SAVUNMA:
//   1. `X-IYZ-SIGNATURE-V3` başlığı doğrulanır (sabit zamanlı).
//   2. Gövdeden YALNIZ referans kodları alınır; tutar, plan, durum —
//      hiçbirine güvenilmez.
//   3. Aboneliğin gerçek durumu SAĞLAYICIYA SORULUR.
//   4. Fiyat, sağlayıcının söylediği değil BİZİM plan tablomuzdaki
//      fiyattır.
// ============================================================
//
// NEDEN 200 DÖNÜYORUZ: sağlayıcılar 2xx almadıklarında webhook'u
// tekrar gönderir. İşleyemediğimiz bir olayda hata dönmek sonsuz tekrara
// yol açar. Bu yüzden imza geçersizse 401, gerisinde işlenemeyen durumlar
// için 200 + log dönüyoruz — sorunu biz araştırırız, sağlayıcı bizi
// dövmesin.

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let payload: SubscriptionWebhookPayload

  try {
    payload = (await request.json()) as SubscriptionWebhookPayload
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const signature =
    request.headers.get('x-iyz-signature-v3') ??
    request.headers.get('X-IYZ-SIGNATURE-V3')

  let valid = false
  try {
    valid = verifyWebhookSignature(payload, signature)
  } catch (e) {
    // Yapılandırma eksikse doğrulama yapılamaz. Bu durumda olayı KABUL
    // ETMEK, imzasız bir bildirimi işlemek olurdu.
    console.error('[billing] webhook imzası doğrulanamadı (yapılandırma)', e)
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }

  if (!valid) {
    console.error('[billing] WEBHOOK İMZASI GEÇERSİZ', {
      eventType: payload.iyziEventType,
    })
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  const subscriptionRef = payload.subscriptionReferenceCode
  if (!subscriptionRef) {
    return NextResponse.json({ ok: true, ignored: 'no_subscription_ref' })
  }

  const supabase = createServiceClient()

  // Aboneliği KENDİ kaydımızla eşleştiriyoruz. Tanımadığımız bir referans
  // başka bir mağazanın olayı olabilir.
  const { data: subscription } = await supabase
    .from('billing_subscriptions')
    .select('id, workspace_id, plan, period')
    .eq('provider_reference', subscriptionRef)
    .maybeSingle()

  if (!subscription) {
    console.error('[billing] tanınmayan abonelik referansı', subscriptionRef)
    return NextResponse.json({ ok: true, ignored: 'unknown_subscription' })
  }

  const eventType = payload.iyziEventType ?? ''

  // ---- Başarısız yenileme ----
  if (eventType === 'subscription.order.failure') {
    await supabase.rpc('mark_subscription_past_due', {
      p_subscription_reference: subscriptionRef,
      p_reason: 'Sağlayıcı yenileme ödemesini tamamlayamadı',
    })
    return NextResponse.json({ ok: true, handled: 'failure' })
  }

  if (eventType !== 'subscription.order.success') {
    // Bilmediğimiz bir olay türü: sessizce kabul et, uydurma bir işlem
    // yapma. Sağlayıcı ileride yeni olaylar ekleyebilir.
    return NextResponse.json({ ok: true, ignored: eventType })
  }

  // ---- Başarılı yenileme ----
  //
  // Gövdedeki hiçbir bilgiyle yetinmeden aboneliği sağlayıcıya soruyoruz.
  let detail
  try {
    detail = await retrieveSubscription(subscriptionRef)
  } catch (e) {
    // Sorgu başarısız: olayı KAYBETMEMEK için 500 dönüp tekrar
    // gönderilmesini istiyoruz. Para geçmiş olabilir; sessizce yutmak
    // mutabakatta kaybolan bir ödeme üretir.
    console.error('[billing] abonelik sorgulanamadı', e)
    return NextResponse.json({ error: 'retrieve_failed' }, { status: 500 })
  }

  // Plan, sağlayıcının fiyat planı referansından çözülür ve BİZİM
  // tablomuzla eşleştirilir. Tanımadığımız bir plana abonelik açmayız.
  const planCode = detail.data?.pricingPlanReferenceCode
  const resolved = planCode ? planFromReferenceCode(planCode) : null

  const plan = resolved?.plan ?? subscription.plan
  const period = resolved?.period ?? subscription.period

  if (resolved && (resolved.plan !== subscription.plan || resolved.period !== subscription.period)) {
    // Sağlayıcıdaki plan bizimkinden farklı: kullanıcı panelden plan
    // değiştirmiş olabilir. Sağlayıcı doğruyu söyler, biz hizalanırız.
    console.warn('[billing] plan sağlayıcıda değişmiş', {
      workspaceId: subscription.workspace_id,
      from: `${subscription.plan}/${subscription.period}`,
      to: `${resolved.plan}/${resolved.period}`,
    })
  }

  // FİYAT BİZİM TABLOMUZDAN. Sağlayıcının döndüğü tutarı kaydetmek,
  // sağlayıcı tarafında değiştirilmiş bir tutarı sorgusuz kabul etmek
  // olurdu.
  const grossKurus = priceFor(plan, period)

  // Yenileme için bir sipariş kaydı açıp hemen kapatıyoruz: ödeme
  // geçmişi ekranı bu satırları gösteriyor ve "ne zaman ne kadar
  // ödedim" sorusunun cevabı burada.
  const { data: order, error: orderError } = await supabase
    .from('billing_orders')
    .insert({
      workspace_id: subscription.workspace_id,
      provider: 'iyzico',
      plan,
      period,
      gross_kurus: grossKurus,
      status: 'pending',
      provider_payment_id: payload.orderReferenceCode ?? null,
    })
    .select('id')
    .single()

  if (orderError || !order) {
    console.error('[billing] yenileme siparişi açılamadı', orderError)
    return NextResponse.json({ error: 'order_failed' }, { status: 500 })
  }

  const { error: settleError } = await supabase.rpc('settle_billing_order', {
    p_order_id: order.id,
    p_provider_payment_id: payload.orderReferenceCode ?? null,
    p_provider_reference: subscriptionRef,
  })

  if (settleError) {
    // Para alındı ama kayıt açılamadı: elle müdahale gerekir.
    console.error('[billing] ÖDEME ALINDI AMA KAYIT AÇILAMADI', {
      workspaceId: subscription.workspace_id,
      orderId: order.id,
      subscriptionRef,
      error: settleError.message,
    })
    return NextResponse.json({ error: 'settle_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, handled: 'success' })
}
