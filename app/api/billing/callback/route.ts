import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  retrieveCheckoutResult,
  verifyCheckoutResult,
  isPaymentSuccessful,
} from '@/lib/billing/iyzico'

// ÖDEME CALLBACK'İ — entegrasyonun güvenlik açısından en kritik noktası.
//
// ============================================================
// TEHDİT: BU UCA HERKES İSTEK ATABİLİR
//
// Sağlayıcı, kullanıcıyı ödeme sonrası buraya POST ile geri gönderir.
// Yani bu uç herkese açıktır ve içeriği tamamen istemci kontrolündedir.
// Gelen gövdedeki "status=success" ifadesine inanmak, tarayıcısından
// sahte başarı bildiren herkese bedava abonelik vermektir.
//
// SAVUNMA ÜÇ KATMANLI:
//   1. Gövdeden YALNIZ belirteç (token) alınır; başka hiçbir alanına
//      güvenilmez — tutar, durum, plan, hiçbiri.
//   2. Sonuç SAĞLAYICIYA SORULUR (retrieveCheckoutResult). Cevap
//      sağlayıcının sunucusundan gelir, kullanıcıdan değil.
//   3. Sağlayıcının yanıtının İMZASI doğrulanır — yanıt yolda
//      değiştirilmiş olabilir.
//
// Üçü de geçmeden hiçbir sipariş 'paid' yapılmaz.
// ============================================================
//
// NEDEN SERVİS ROLÜ: bu istek oturumsuz gelir; isteği yapan sağlayıcının
// sunucusudur, kullanıcı değil. settle_billing_order da bilinçli olarak
// `authenticated` rolüne kapalı. Ayrıntı: lib/supabase/service.ts.

// Ödeme kaydı yazan bir uç önbelleğe alınamaz.
export const dynamic = 'force-dynamic'

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url), {
    // 303: POST'tan GET'e geçiş. 302 bırakılırsa bazı istemciler
    // yönlendirmeyi POST olarak tekrarlar ve kullanıcı ödeme sonucu
    // sayfasına gövdeyle çarpar.
    status: 303,
  })
}

/**
 * Sipariş kimliği biçimi — yedek eşleştirmede sağlayıcıdan gelen
 * conversationId'yi sorguya koymadan önce doğrulamak için. İmza zaten
 * doğrulanmış oluyor ama biçimi bozuk bir değeri veritabanına
 * göndermenin bir anlamı yok.
 */
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export async function POST(request: NextRequest) {
  let token: string | null = null

  try {
    const form = await request.formData()
    token = (form.get('token') as string | null) ?? null
  } catch {
    token = null
  }

  if (!token) {
    return redirectTo(request, '/teacher/ayarlar/abonelik?odeme=gecersiz')
  }

  const supabase = createServiceClient()

  // Belirteci KENDİ kaydımızla eşleştiriyoruz. Tanımadığımız bir belirteç,
  // başka bir mağazanın ödemesi ya da uydurma olabilir.
  let { data: order } = await supabase
    .from('billing_orders')
    .select('id, status, workspace_id, gross_kurus')
    .eq('provider_token', token)
    .maybeSingle()

  // Sağlayıcı yanıtı: normalde aşağıda sorgulanır, ama yedek eşleştirme
  // için erken gerekebilir. İki kez sorgulamamak için burada tutuluyor.
  let result: Awaited<ReturnType<typeof retrieveCheckoutResult>> | null = null

  // ---- YEDEK EŞLEŞTİRME (068 · rapor bulgusu 2) ----
  //
  // Belirteç siparişe yazılamamışsa buraya düşülür. Artık ödeme
  // başlatılırken bu durum engelleniyor (abonelik/actions.ts), ama o
  // düzeltmeden ÖNCE başlatılmış ödemeler ve yazma ile callback arasında
  // kalan yarış durumları hâlâ mümkün.
  //
  // Sipariş kimliğimiz zaten sağlayıcıya conversationId olarak
  // gidiyordu (lib/billing/iyzico.ts) ve yanıtta geri geliyordu —
  // yalnızca hiç okunmuyordu. Yeni bir entegrasyon değil, var olan
  // alanın kullanılması.
  //
  // GÜVENLİ: kimlik ancak İMZA DOĞRULANDIKTAN sonra kabul ediliyor,
  // yani değeri sağlayıcının ürettiği kanıtlanmış oluyor. Tutar
  // kontrolü de aşağıda aynen çalışıyor.
  if (!order) {
    try {
      result = await retrieveCheckoutResult(token)
    } catch (e) {
      console.error('[billing] yedek eşleştirme için sonuç sorgulanamadı', e)
      return redirectTo(request, '/teacher/ayarlar/abonelik?odeme=belirsiz')
    }

    if (!verifyCheckoutResult(result)) {
      console.error('[billing] tanınmayan belirteç + imza doğrulanamadı')
      return redirectTo(request, '/teacher/ayarlar/abonelik?odeme=gecersiz')
    }

    const conversationId = result.conversationId
    if (conversationId && UUID_PATTERN.test(conversationId)) {
      const { data: fallbackOrder } = await supabase
        .from('billing_orders')
        .select('id, status, workspace_id, gross_kurus')
        .eq('id', conversationId)
        .maybeSingle()
      order = fallbackOrder ?? null

      // Belirteci şimdi bağlıyoruz: tekrarlanan bildirim ilk yoldan
      // eşleşsin ve bu dal bir daha çalışmasın.
      if (order) {
        await supabase
          .from('billing_orders')
          .update({ provider_token: token })
          .eq('id', order.id)
        console.error('[billing] sipariş yedek yoldan eşleşti', { orderId: order.id })
      }
    }
  }

  if (!order) {
    console.error('[billing] tanınmayan belirteç ile callback')
    return redirectTo(request, '/teacher/ayarlar/abonelik?odeme=gecersiz')
  }

  // Tekrarlanan callback: sağlayıcılar aynı bildirimi birden çok kez
  // gönderebilir. settle_billing_order zaten idempotent ama buradan da
  // erken dönerek gereksiz ağ isteğinden kaçınıyoruz.
  if (order.status === 'paid') {
    return redirectTo(request, '/teacher/ayarlar/abonelik?odeme=tamam')
  }

  try {
    // Yedek eşleştirme sırasında zaten sorgulandıysa tekrarlanmaz.
    result = result ?? (await retrieveCheckoutResult(token))
  } catch (e) {
    console.error('[billing] sonuç sorgulanamadı', e)
    // Sipariş 'pending' KALIR, 'failed' YAPILMAZ: ödeme gerçekten
    // gerçekleşmiş ama bizim sorgumuz başarısız olmuş olabilir. Parayı
    // almışken siparişi başarısız işaretlemek, mutabakatta kaybolan bir
    // ödeme üretir.
    return redirectTo(request, '/teacher/ayarlar/abonelik?odeme=belirsiz')
  }

  if (!verifyCheckoutResult(result)) {
    console.error('[billing] İMZA DOĞRULANAMADI', { orderId: order.id })
    await supabase.rpc('fail_billing_order', {
      p_order_id: order.id,
      p_reason: 'Yanıt imzası doğrulanamadı',
    })
    return redirectTo(request, '/teacher/ayarlar/abonelik?odeme=basarisiz')
  }

  if (!isPaymentSuccessful(result)) {
    await supabase.rpc('fail_billing_order', {
      p_order_id: order.id,
      p_reason: result.errorMessage || result.paymentStatus || 'Bilinmeyen hata',
    })
    return redirectTo(request, '/teacher/ayarlar/abonelik?odeme=basarisiz')
  }

  // TUTAR DOĞRULAMASI: imza geçerli olsa bile ödenen tutarın beklediğimiz
  // tutar olduğunu ayrıca kontrol ediyoruz. Sipariş açıldıktan sonra
  // sağlayıcı tarafında değiştirilmiş bir tutar, imzalı ve "başarılı"
  // görünürdü.
  const paidKurus = Math.round(Number(result.paidPrice) * 100)
  if (!Number.isFinite(paidKurus) || paidKurus !== order.gross_kurus) {
    console.error('[billing] TUTAR UYUŞMUYOR', {
      orderId: order.id,
      expected: order.gross_kurus,
      paid: paidKurus,
    })
    await supabase.rpc('fail_billing_order', {
      p_order_id: order.id,
      p_reason: `Tutar uyuşmuyor: beklenen ${order.gross_kurus}, ödenen ${paidKurus}`,
    })
    return redirectTo(request, '/teacher/ayarlar/abonelik?odeme=basarisiz')
  }

  const { error } = await supabase.rpc('settle_billing_order', {
    p_order_id: order.id,
    p_provider_payment_id: result.paymentId ?? null,
    p_provider_reference: null,
  })

  if (error) {
    // Para alındı ama abonelik açılamadı: bu, sessizce geçilemeyecek tek
    // durum. Sipariş 'pending' kalır ki elle kapatılabilsin.
    console.error('[billing] ÖDEME ALINDI AMA KAYIT AÇILAMADI', {
      orderId: order.id,
      paymentId: result.paymentId,
      error: error.message,
    })
    return redirectTo(request, '/teacher/ayarlar/abonelik?odeme=belirsiz')
  }

  return redirectTo(request, '/teacher/ayarlar/abonelik?odeme=tamam')
}

// Sağlayıcı bazı akışlarda GET ile döner; aynı işlemi yapmak yerine
// kullanıcıyı abonelik sayfasına bırakıyoruz. Ödeme durumu orada
// veritabanından okunur — yönlendirme parametresinden değil.
export async function GET(request: NextRequest) {
  return redirectTo(request, '/teacher/ayarlar/abonelik')
}
