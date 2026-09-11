'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { tabLinkClass, type LinkTab } from '@/components/shared/link-tabs'
import { cn } from '@/lib/utils'

/**
 * Sekme şeridindeki AİLE başlığı (R7 / Site Testi 03).
 *
 * İki farklı davranış var ve ayrımı `tab.href` belirliyor:
 *
 *   href VAR  ("Ödevler", "Kaynaklar") — başlık gerçek bir bağlantıdır ve
 *     doğrudan varsayılan alt görünümü açar. Dokümanın şartı: "İki büyük
 *     karttan oluşan zorunlu bir ara açılış ekranı yapılmamalıdır."
 *     Diğer alt görünümlere yanındaki ok ile geçilir.
 *
 *   href YOK  ("Diğer") — başlığın kendisi bir yere gitmez; altındaki
 *     ekranların hiçbiri varsayılan sayılamaz.
 *
 * NEDEN AYRI DOSYA: açılır menü client state ister, oysa `LinkTabs`
 * öğrenci/veli sayfalarında sunucu bileşeni olarak da çağrılıyor. Menü
 * buraya alınınca şerit sunucuda render edilebilir kalıyor.
 */
export function TabGroupMenu({ tab, active }: { tab: LinkTab; active: boolean }) {
  const items = tab.items ?? []

  return (
    <div className="flex shrink-0 items-center">
      {tab.href ? (
        <Link
          href={tab.href}
          aria-current={active ? 'page' : undefined}
          className={cn(tabLinkClass(active), 'pr-1')}
        >
          {tab.label}
        </Link>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger
          // Başlık ayrıca bağlantıysa ok yalnız listeyi açar; ekran
          // okuyucuya iki ayrı kontrol olduğunu söylemek gerekiyor.
          aria-label={tab.href ? `${tab.label} alt görünümleri` : tab.label}
          className={cn(
            tabLinkClass(active),
            'flex items-center gap-1',
            tab.href && 'pl-1'
          )}
        >
          {tab.href ? null : tab.label}
          <ChevronDown className="size-3.5" aria-hidden />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-52">
          {items.map(item => (
            <DropdownMenuItem
              key={item.key}
              render={<Link href={item.href ?? '#'} />}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
