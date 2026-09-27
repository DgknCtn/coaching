import { NextResponse, type NextRequest } from 'next/server'
import { clearReferralCode } from '@/lib/referral'

/**
 * Geç kurulumun (app/page.tsx) son adımı: davet kodu çerezini sil, ana
 * sayfaya dön.
 *
 * NEDEN AYRI UÇ: çerez yalnız Server Action ya da Route Handler içinde
 * değiştirilebilir. Silme önce doğrudan app/page.tsx'teydi (bir Server
 * Component) ve Next.js orada hata fırlatıyordu:
 *
 *   "Cookies can only be modified in a Server Action or Route Handler."
 *
 * Çalışma alanı o ana kadar kurulmuş oluyordu ama Google ile ilk kez giren
 * HER kullanıcı "Bir hata oluştu" ekranı görüyordu (27 Eylül 2026, canlı
 * log). Kurulum başarılı olunca sayfa artık buraya yönlendiriyor.
 *
 * Tekrar çağrılması zararsız: çerez yoksa silme bir şey yapmaz.
 */
export async function GET(request: NextRequest) {
  await clearReferralCode()
  return NextResponse.redirect(new URL('/', request.nextUrl.origin))
}
