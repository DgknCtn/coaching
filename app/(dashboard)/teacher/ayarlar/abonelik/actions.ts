'use server'

import { headers } from 'next/headers'
import { getTeacherContext } from '@/lib/workspace'
import { createClient } from '@/lib/supabase/server'
import { dbErrorToTr } from '@/lib/auth-errors'
import { trackFeature } from '@/lib/telemetry'
import { logAudit } from '@/lib/audit'
import { isSelfService, MAX_MONTHS } from '@/lib/billing/pricing'
import { initializeCheckoutForm } from '@/lib/billing/iyzico'

// LİSANS SATIN ALMA.
//
// AKIŞ: sipariş aç (sunucu fiyatıyla) -> sağlayıcıda form oturumu aç ->
// kullanıcıyı barındırılan ödeme sayfasına gönder -> callback lisansı açar.
//
// TUTAR HİÇBİR AŞAMADA İSTEMCİDEN ALINMAZ. İstemci yalnız öğrenci sayısı
// ve süre söyler; fiyatı `create_billing_order` veritabanında hesaplar.
// Aksi hâlde 1 kuruşa 12 aylık lisans satın alınabilirdi.

export async function purchaseLicenseAction(
  studentCount: number,
  months: number
): Promise<{ error?: string; paymentPageUrl?: string }> {
  if (!Number.isInteger(studentCount) || !isSelfService(studentCount)) {
    return { error: 'Geçerli bir öğrenci sayısı girin.' }
  }
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
    return { error: 'Süre 1 ile 12 ay arasında olmalı.' }
  }

  const { workspaceId, profile, workspace } = await getTeacherContext()
  const supabase = await createClient()

  const { data: order, error: orderError } = await supabase.rpc('create_billing_order', {
    p_workspace_id: workspaceId,
    p_student_count: studentCount,
    p_months: months,
  })

  if (orderError) return { error: dbErrorToTr(orderError.message) }

  const created = order as unknown as { order_id: string; gross_kurus: number }

  // Alıcı bilgisi: sağlayıcı bu alanları zorunlu tutuyor ama biz
  // öğretmenden TC kimlik ya da adres TOPLAMIYORUZ — dijital bir hizmet
  // için gereksiz kişisel veri ve KVKK'daki veri minimizasyonuna aykırı.
  // Gerçek fatura bilgisi e-arşiv tarafında, satış sonrası alınır.
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
      planName: `${studentCount} öğrenci · ${months} ay lisans`,
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
    // Ham hata metni kullanıcıya gösterilmez: yapılandırma ayrıntısı ve
    // anahtar adı sızdırabilir.
    console.error('[billing] lisans ödemesi başlatılamadı', e)
    return { error: 'Ödeme sayfası açılamadı. Lütfen biraz sonra tekrar deneyin.' }
  }

  if (session.status !== 'success' || !session.paymentPageUrl) {
    console.error('[billing] sağlayıcı formu reddetti', session.errorCode, session.errorMessage)
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
    detail: { studentCount, months },
  })
  await trackFeature(supabase, workspaceId, 'billing.checkout_start')

  return { paymentPageUrl: session.paymentPageUrl }
}
