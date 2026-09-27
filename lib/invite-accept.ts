import 'server-only'
import { cookies } from 'next/headers'
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/active-workspace'
import { panelForRole } from '@/lib/landing-decision'

// DAVET KABULÜNÜN ORTAK BİTİŞİ.
//
// Kabul üç yerden yapılıyor: davet formu (e-posta + şifre), davet
// linkinin Google/oturum yolu (/invite/[token]/kabul) ve /hosgeldin
// listesi. Üçü de aynı şekilde bitmeli:
//
//   1. Kabul edilen alan AKTİF ALAN olur. Aksi hâlde başka bir alanda
//      öğretmen olan biri, çocuğunun veli davetini kabul ettikten sonra
//      yine kendi öğretmen paneline düşerdi (app/page.tsx varsayılan
//      alana göre yönlendiriyor; kabul yalnız BOŞ varsayılanı dolduruyor).
//   2. Kullanıcı doğrudan davetin rolüne ait panele gider.
//
// Yalnız Server Action ya da Route Handler içinden çağrılır: çerez yazar.

export interface AcceptedInvitation {
  workspace_id?: string
  role?: string
}

export async function finishInviteAcceptance(result: unknown): Promise<string> {
  const accepted = (result ?? {}) as AcceptedInvitation
  if (accepted.workspace_id) {
    const store = await cookies()
    store.set(ACTIVE_WORKSPACE_COOKIE, accepted.workspace_id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  return panelForRole(accepted.role)
}

/**
 * "a***@gmail.com" — yanlış hesapla gelen kullanıcıya iki adresi
 * gösterirken tamamını açığa vurmamak için.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '—'
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return `${local.charAt(0)}***@${domain}`
}
