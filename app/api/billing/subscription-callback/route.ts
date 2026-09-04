import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { retrieveSubscription } from '@/lib/billing/iyzico-subscription'
import { planFromReferenceCode } from '@/lib/billing/plan-codes'

// ABONELİK KURULUM CALLBACK'İ.
//
// Kart adımındaki barındırılan form tamamlanınca sağlayıcı buraya POST
// atar. Gövde, çalışma alanı kimliğini (conversationId) ve abonelik
// referansını taşır.
//
// ============================================================
// GÖVDEYE GÜVENİLMEZ
//
// Bu uç herkese açık. "Aboneliğim kuruldu" diyen bir POST'a inanmak,
// kart vermeden abonelik açtırmak demektir. Bu yüzden gövdeden yalnız
// REFERANS alınır ve aboneliğin gerçekten kurulup kurulmadığı
// SAĞLAYICIYA SORULUR.
//
// Ayrıca çalışma alanı kimliği doğrulanır: sağlayıcının döndüğü
// conversationId, sorguladığımız aboneliğin gerçekten o çalışma alanına
// ait olduğunu göstermeli — aksi hâlde biri başkasının aboneliğini kendi
// çalışma alanına bağlayabilirdi.
// ============================================================

export const dynamic = 'force-dynamic'

function redirectTo(request: NextRequest, path: string) {
  // 303: POST'tan GET'e geçiş. 302 bırakılırsa bazı istemciler
  // yönlendirmeyi POST olarak tekrarlar.
  return NextResponse.redirect(new URL(path, request.url), { status: 303 })
}

export async function POST(request: NextRequest) {
  let subscriptionRef: string | null = null
  let conversationId: string | null = null

  try {
    const form = await request.formData()
    subscriptionRef =
      (form.get('subscriptionReferenceCode') as string | null) ??
      (form.get('referenceCode') as string | null)
    conversationId = form.get('conversationId') as string | null
  } catch {
    subscriptionRef = null
  }

  if (!subscriptionRef) {
    return redirectTo(request, '/kurulum/odeme?kart=basarisiz')
  }

  let detail
  try {
    detail = await retrieveSubscription(subscriptionRef)
  } catch (e) {
    console.error('[billing] abonelik sorgulanamadı', e)
    return redirectTo(request, '/kurulum/odeme?kart=belirsiz')
  }

  if (detail.status !== 'success' || !detail.data?.referenceCode) {
    console.error('[billing] abonelik kurulamadı', detail.errorMessage)
    return redirectTo(request, '/kurulum/odeme?kart=basarisiz')
  }

  const supabase = createServiceClient()

  // Çalışma alanı: conversationId'den gelir ama DOĞRULANIR — böyle bir
  // çalışma alanı gerçekten var mı?
  if (!conversationId) {
    console.error('[billing] callback çalışma alanı kimliği taşımıyor')
    return redirectTo(request, '/kurulum/odeme?kart=basarisiz')
  }

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', conversationId)
    .maybeSingle()

  if (!workspace) {
    console.error('[billing] tanınmayan çalışma alanı', conversationId)
    return redirectTo(request, '/kurulum/odeme?kart=basarisiz')
  }

  const resolved = detail.data.pricingPlanReferenceCode
    ? planFromReferenceCode(detail.data.pricingPlanReferenceCode)
    : null

  if (!resolved) {
    // Tanımadığımız bir fiyat planı: kendi tablomuzda karşılığı olmayan
    // bir abonelik açmayız.
    console.error(
      '[billing] tanınmayan fiyat planı',
      detail.data.pricingPlanReferenceCode
    )
    return redirectTo(request, '/kurulum/odeme?kart=basarisiz')
  }

  // Deneme bitişi SAĞLAYICIDAN gelir, biz hesaplamayız. İki taraf farklı
  // tarih tutarsa kullanıcı bizde "3 gün kaldı" görürken sağlayıcı çekim
  // yapabilir.
  const trialEnd = detail.data.trialEndDate ?? detail.data.endDate ?? null

  const { error } = await supabase.rpc('start_trial_subscription', {
    p_workspace_id: workspace.id,
    p_plan: resolved.plan,
    p_period: resolved.period,
    p_subscription_reference: detail.data.referenceCode,
    p_customer_reference: detail.data.customerReferenceCode ?? null,
    p_trial_ends_at: trialEnd,
  })

  if (error) {
    console.error('[billing] abonelik kaydedilemedi', {
      workspaceId: workspace.id,
      subscriptionRef,
      error: error.message,
    })
    return redirectTo(request, '/kurulum/odeme?kart=belirsiz')
  }

  return redirectTo(request, '/teacher?kart=tamam')
}

// Sağlayıcı bazı akışlarda GET ile dönebilir; kullanıcıyı kart adımına
// bırakıyoruz. Durum orada veritabanından okunur.
export async function GET(request: NextRequest) {
  return redirectTo(request, '/kurulum/odeme')
}
