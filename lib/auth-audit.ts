import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requestContext } from '@/lib/request-ip'

// GİRİŞ/ÇIKIŞ DENETİM KAYDI (089).
//
// NEDEN lib/audit.ts'ten AYRI: `audit_events` 051'de açık bir kararla
// kişisel veriden arındırılmış tutuluyor ("bu tablo uzun ömürlü ve silme
// taleplerinde temizlenmesi gereken bir yer olmamalı"). IP, cihaz ve
// konum kişisel veridir; onları oraya karıştırmak o kararı sessizce
// bozmak olurdu. Ayrı tablo, ayrı saklama süresi (90 gün), ayrı modül.
//
// Desen `lib/audit.ts` ile BİLEREK aynı: sabit olay listesi, Türkçe etiket
// haritası, asla patlamayan yazma. İki modülün farklı davranması, birini
// okuyanın diğerini de bildiğini sanmasına yol açardı.

/** Kaydedilen olaylar. Serbest metin değil, sabit liste — SQL'deki CHECK ile aynı. */
export type AuthEventType =
  | 'login.success'
  | 'login.failed'
  | 'login.rate_limited'
  | 'logout'
  | 'password_reset_requested'
  | 'password_changed'
  | 'register'
  | 'session_revoked'

/** Yönetim panelindeki tablo için okunabilir karşılıklar. */
export const AUTH_EVENT_LABEL: Record<string, string> = {
  'login.success': 'Giriş yaptı',
  'login.failed': 'Başarısız giriş denemesi',
  'login.rate_limited': 'Çok fazla deneme — engellendi',
  logout: 'Çıkış yaptı',
  password_reset_requested: 'Şifre sıfırlama istedi',
  password_changed: 'Şifresini değiştirdi',
  register: 'Hesap oluşturdu',
  session_revoked: 'Oturumu sonlandırıldı',
}

/** Bilinmeyen olayda ham anahtarı döner — tablo boş satır göstermez. */
export function authEventLabel(type: string): string {
  return AUTH_EVENT_LABEL[type] ?? type
}

export interface AuthEventInput {
  type: AuthEventType
  /** Bilinen hesap. Tanınmayan bir adrese yapılan denemede boş bırakılır. */
  profileId?: string | null
  workspaceId?: string | null
  /** Kişisel veri KOYULMAZ; sayı, tarih ve id yeterli. */
  detail?: Record<string, unknown>
}

/**
 * Olayı kaydeder.
 *
 * ASLA PATLAMAZ, ASLA AKIŞI DURDURMAZ: RPC'nin kendisi hatayı yutuyor
 * (089) ve burada da yakalanıyor. Denetim satırı yazılamadı diye
 * kullanıcının giriş yapamaması, çok daha kötü bir arıza olurdu.
 *
 * `await` EDİLMELİ ama sonucu okunmaz: sunucu eylemi `redirect()` ile
 * bittiği için beklenmeyen bir söz (promise) yarıda kesilir ve kayıt
 * kaybolur.
 */
export async function logAuthEvent(
  { type, profileId, workspaceId, detail }: AuthEventInput,
  client?: SupabaseClient
): Promise<void> {
  try {
    const supabase = client ?? (await createClient())
    const ctx = await requestContext()

    await supabase.rpc('log_auth_event', {
      p_event_type: type,
      p_profile_id: profileId ?? null,
      p_workspace_id: workspaceId ?? null,
      p_ip: ctx.ip,
      p_user_agent: ctx.userAgent,
      p_country: ctx.country,
      p_city: ctx.city,
      p_detail: detail ?? {},
    })
  } catch (error) {
    console.error(
      '[auth-audit] olay kaydedilemedi:',
      JSON.stringify({ type, message: (error as Error)?.message })
    )
  }
}

/**
 * E-postadan profil kimliğini çözer — BAŞARISIZ giriş kaydı için.
 *
 * NEDEN E-POSTA SAKLANMIYOR: ham adresi yazmak iki riski birden
 * getirirdi. Birincisi gereksiz kişisel veri. İkincisi daha sinsi:
 * kullanıcı şifresini yanlışlıkla e-posta alanına yazdığında, o şifre
 * denetim tablosuna düz metin olarak düşerdi.
 *
 * Adres bilinen bir hesaba aitse kimliği yazılır; değilse olay
 * `profile_id` olmadan kaydedilir — "tanınmayan bir hesaba deneme
 * yapıldı" bilgisi de kendi başına anlamlıdır.
 *
 * SERVİS ROLÜ KULLANILMIYOR: arama, oturumsuz istemcinin RLS'i altında
 * yapılıyor ve bu bilinçli. Oturumsuz bir istekte profil aramak için
 * RLS'i atlayan bir anahtar kullanmak, bu fonksiyonu hesap sayım
 * (enumeration) aracına çevirirdi.
 */
export async function resolveProfileIdByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()
    return (data as { id: string } | null)?.id ?? null
  } catch {
    return null
  }
}
