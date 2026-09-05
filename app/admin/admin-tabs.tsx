'use client'

import { usePathname } from 'next/navigation'
import { LinkTabs, type LinkTab } from '@/components/shared/link-tabs'
import { adminNav } from '@/components/nav-config'

/**
 * Yönetim sekmeleri.
 *
 * ÖNCEDEN AKTİF SEKME GÖRÜNMÜYORDU: layout üç bağlantıyı da aynı soluk
 * renkte çiziyordu, `aria-current` da yoktu. Yani ekranda ne gözle ne de
 * ekran okuyucuyla "şu an neredeyim" sorusunun cevabı vardı — üç sayfanın
 * başlığı da olmadığı için (artık var) kullanıcı yalnız adres çubuğuna
 * bakarak yerini bulabiliyordu.
 *
 * Öğrenci çalışma masasıyla aynı bileşen ve aynı gerekçe: aktif sekme
 * pathname'den türetiliyor, sekmelerin kendisi gerçek bağlantı kalıyor.
 */
export function AdminTabs() {
  const pathname = usePathname()

  const tabs: LinkTab[] = adminNav.map((item) => ({
    key: item.href,
    label: item.label,
    href: item.href,
  }))

  const active = adminNav.find((item) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href)
  )

  return (
    <LinkTabs tabs={tabs} activeKey={active?.href ?? ''} ariaLabel="Yönetim menüsü"
      // Alt çizgi header'ın kendi border'ında; ikisi üst üste binerdi.
      className="border-b-0"
    />
  )
}
