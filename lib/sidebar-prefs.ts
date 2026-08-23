import { cookies } from 'next/headers'
import { SIDEBAR_COOKIE } from '@/lib/sidebar-cookie'

/**
 * Masaüstü sidebar'ın daraltılmış olup olmadığı.
 *
 * localStorage yerine cookie: değer sunucuda okunabildiği için ilk boyada
 * geniş rail basılıp sonra daralma (layout zıplaması) yaşanmaz. Yazma tarafı
 * client'ta, components/shared/app-sidebar.tsx içinde.
 */
export async function getSidebarCollapsed(): Promise<boolean> {
  const store = await cookies()
  return store.get(SIDEBAR_COOKIE)?.value === '1'
}
