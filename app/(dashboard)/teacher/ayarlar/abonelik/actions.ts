'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getTeacherContext } from '@/lib/workspace'
import { createClient } from '@/lib/supabase/server'
import { dbErrorToTr } from '@/lib/auth-errors'
import { trackFeature } from '@/lib/telemetry'
import { logAudit } from '@/lib/audit'
import { installmentsFor, type PayablePlanId, type BillingPeriod } from '@/lib/billing/pricing'
import { PLANS } from '@/lib/plans'
import { initializeCheckoutForm } from '@/lib/billing/iyzico'

// ÖDEME BAŞLATMA.
//
// AKIŞ: sipariş aç (sunucu fiyatıyla) -> sağlayıcıda form oturumu aç ->
// kullanıcıyı sağlayıcının barındırılan sayfasına gönder.
//
// TUTAR HİÇBİR AŞAMADA İSTEMCİDEN ALINMAZ. İstemci yalnız plan ve dönem
// söyler; fiyatı `create_billing_order` veritabanında belirler. Aksi
// hâlde 1 kuruşa yıllık plan satın alınabilirdi.

const VALID_PLANS: PayablePlanId[] = ['starter', 'coach']
const VALID_PERIODS: BillingPeriod[] = ['monthly', 'yearly']

export async function startCheckoutAction(
  plan: string,
  period: string,
  installment: number
): Promise<{ error?: string; paymentPageUrl?: string }> {
  if (!VALID_PLANS.includes(plan as PayablePlanId)) {
    return { error: 'Geçersiz plan seçildi.' }
  }
  if (!VALID_PERIODS.includes(period as BillingPeriod)) {
    return { error: 'Geçersiz ödeme dönemi seçildi.' }
  }

  const typedPlan = plan as PayablePlanId
  const typedPeriod = period as BillingPeriod

  // Taksit yalnız yıllıkta — kural üç yerde birden duruyor (burada,
  // veritabanı kısıtında ve pricing.ts'te). Fazlalık değil: her katman
  // kendi başına doğru olmalı, çünkü her biri ayrı ayrı atlanabilir.
  const allowed = installmentsFor(typedPeriod)
  if (!allowed.includes(installment)) {
    return { error: 'Bu ödeme dönemi için seçilen taksit sayısı kullanılamaz.' }
  }

  const { workspaceId, profile, workspace } = await getTeacherContext()
  const supabase = await createClient()

  const { data: order, error: orderError } = await supabase.rpc('create_billing_order', {
    p_workspace_id: workspaceId,
    p_plan: typedPlan,
    p_period: typedPeriod,
    p_installment: installment,
  })

  if (orderError) return { error: dbErrorToTr(orderError.message) }

  const created = order as unknown as { order_id: string; gross_kurus: number }

  // Alıcı bilgisi: iyzico bu alanları zorunlu tutuyor ama biz öğretmenden
  // TC kimlik ya da adres TOPLAMIYORUZ — dijital bir hizmet için gereksiz
  // kişisel veri olurdu ve KVKK'daki veri minimizasyonuna aykırı düşerdi.
  // Zorunlu alanlar yer tutucuyla doldurulur; gerçek fatura bilgisi
  // e-arşiv tarafında, satış sonrası alınır.
  const [name, ...rest] = (profile.full_name || 'Kullanıcı').trim().split(/\s+/)
  const surname = rest.join(' ') || '-'

  const headerList = await headers()
  const ip =
    headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headerList.get('x-real-ip') ||
    '85.34.78.112'

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    return { error: 'Uygulama adresi yapılandırılmamış; ödeme başlatılamıyor.' }
  }

  let session
  try {
    session = await initializeCheckoutForm({
      orderId: created.order_id,
      grossKurus: created.gross_kurus,
      installments: [installment],
      planName: `${PLANS[typedPlan].name} — ${typedPeriod === 'yearly' ? 'Yıllık' : 'Aylık'}`,
      callbackUrl: `${appUrl.replace(/\/$/, '')}/api/billing/callback`,
      buyer: {
        id: workspaceId,
        name,
        surname,
        email: profile.email || 'bilinmiyor@example.com',
        identityNumber: '11111111111',
        registrationAddress: (workspace as { name?: string }).name || 'Bilinmiyor',
        city: 'İstanbul',
        country: 'Turkey',
        ip,
      },
    })
  } catch (e) {
    // Sağlayıcı hatasının HAM METNİ kullanıcıya gösterilmez: yapılandırma
    // ayrıntısı ve anahtar adı sızdırabilir.
    console.error('[billing] checkout başlatılamadı', e)
    return { error: 'Ödeme sayfası açılamadı. Lütfen biraz sonra tekrar deneyin.' }
  }

  if (session.status !== 'success' || !session.paymentPageUrl) {
    console.error('[billing] iyzico form reddetti', session.errorCode, session.errorMessage)
    return { error: 'Ödeme sayfası açılamadı. Lütfen biraz sonra tekrar deneyin.' }
  }

  // Belirteci siparişe bağlıyoruz: callback yalnız belirteci taşır.
  await supabase
    .from('billing_orders')
    .update({ provider_token: session.token })
    .eq('id', created.order_id)

  await logAudit(supabase, {
    workspaceId,
    action: 'billing.checkout_started',
    entityType: 'billing_order',
    entityId: created.order_id,
    detail: { plan: typedPlan, period: typedPeriod, installment },
  })
  await trackFeature(supabase, workspaceId, 'billing.checkout_start')

  return { paymentPageUrl: session.paymentPageUrl }
}

/**
 * Aboneliği iptal eder.
 *
 * Erişim hemen kesilmez: ödenen dönemin sonuna kadar sürer. İptali
 * zorlaştırmak mesafeli satış mevzuatına aykırı; tek tıkla ve gerekçe
 * sormadan yapılabilmeli.
 */
export async function cancelSubscriptionAction(): Promise<{
  error?: string
  accessUntil?: string
}> {
  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('cancel_subscription', {
    p_workspace_id: workspaceId,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher/ayarlar/abonelik')
  return { accessUntil: (data as unknown as { access_until: string }).access_until }
}
