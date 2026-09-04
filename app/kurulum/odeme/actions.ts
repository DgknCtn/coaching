'use server'

import { getTeacherContext } from '@/lib/workspace'
import { createClient } from '@/lib/supabase/server'
import { trackFeature } from '@/lib/telemetry'
import { logAudit } from '@/lib/audit'
import type { PayablePlanId, BillingPeriod } from '@/lib/billing/pricing'
import { pricingPlanReferenceCode } from '@/lib/billing/plan-codes'
import { initializeSubscriptionCheckout } from '@/lib/billing/iyzico-subscription'

// KART ADIMI — abonelik başlatma.
//
// Kayıt sonrası kullanıcı buraya gelir, planını seçer ve kartını
// sağlayıcının barındırılan formuna girer. TAHSİLAT YAPILMAZ; sağlayıcı
// kartı yalnız 1 TL provizyon + iade ile doğrular ve ilk çekimi deneme
// süresi sonunda kendisi yapar.
//
// Sonuç bu dosyada işlenmez: form tamamlanınca sağlayıcı
// /api/billing/subscription-callback adresine POST atar. İstemcinin
// "başarılı oldu" demesine güvenmemek için sonuç orada, sağlayıcıya
// sorularak kaydedilir.

const VALID_PLANS: PayablePlanId[] = ['starter', 'coach']
const VALID_PERIODS: BillingPeriod[] = ['monthly', 'yearly']

export async function startSubscriptionAction(
  plan: string,
  period: string
): Promise<{ error?: string; formContent?: string }> {
  if (!VALID_PLANS.includes(plan as PayablePlanId)) {
    return { error: 'Geçersiz plan seçildi.' }
  }
  if (!VALID_PERIODS.includes(period as BillingPeriod)) {
    return { error: 'Geçersiz ödeme dönemi seçildi.' }
  }

  const typedPlan = plan as PayablePlanId
  const typedPeriod = period as BillingPeriod

  const { workspaceId, profile, workspace } = await getTeacherContext()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    return { error: 'Uygulama adresi yapılandırılmamış; ödeme başlatılamıyor.' }
  }

  // Alıcı bilgisi: sağlayıcı bu alanları zorunlu tutuyor ama biz
  // öğretmenden TC kimlik ya da adres TOPLAMIYORUZ — dijital bir hizmet
  // için gereksiz kişisel veri ve KVKK'daki veri minimizasyonuna aykırı.
  const [name, ...rest] = (profile.full_name || 'Kullanıcı').trim().split(/\s+/)
  const surname = rest.join(' ') || '-'
  const workspaceName = (workspace as { name?: string }).name || 'Bilinmiyor'

  let session
  try {
    session = await initializeSubscriptionCheckout({
      pricingPlanReferenceCode: pricingPlanReferenceCode(typedPlan, typedPeriod),
      // Çalışma alanı kimliği: callback'te aboneliği buna bağlıyoruz.
      conversationId: workspaceId,
      callbackUrl: `${appUrl.replace(/\/$/, '')}/api/billing/subscription-callback`,
      customer: {
        name,
        surname,
        email: profile.email || 'bilinmiyor@example.com',
        identityNumber: '11111111111',
        billingAddress: {
          contactName: `${name} ${surname}`.trim(),
          city: 'İstanbul',
          country: 'Turkey',
          address: workspaceName,
        },
      },
    })
  } catch (e) {
    // Ham hata metni kullanıcıya gösterilmez: yapılandırma ayrıntısı ve
    // anahtar adı sızdırabilir.
    console.error('[billing] abonelik formu başlatılamadı', e)
    return { error: 'Ödeme formu açılamadı. Lütfen biraz sonra tekrar deneyin.' }
  }

  const formContent = session.data?.checkoutFormContent
  if (session.status !== 'success' || !formContent) {
    console.error('[billing] sağlayıcı abonelik formunu reddetti', {
      code: session.errorCode,
      message: session.errorMessage,
    })
    return { error: 'Ödeme formu açılamadı. Lütfen biraz sonra tekrar deneyin.' }
  }

  const supabase = await createClient()
  await logAudit(supabase, {
    workspaceId,
    action: 'billing.checkout_started',
    entityType: 'workspace',
    entityId: workspaceId,
    detail: { plan: typedPlan, period: typedPeriod, mode: 'subscription' },
  })
  await trackFeature(supabase, workspaceId, 'billing.checkout_start')

  return { formContent }
}
