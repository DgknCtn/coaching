import Link from 'next/link'
import { cn } from '@/lib/utils'
import { TabGroupMenu } from '@/components/shared/tab-group-menu'

// URL tabanlı sekme şeridi (ders/kapsam seçimi).
//
// Neden components/ui/tabs DEĞİL: o bileşen seçili sekmeyi CLIENT state'te
// tutar. Buradaki sekmeler sunucu tarafında veri çekimini belirliyor
// (?scope=... ile farklı sorgu çalışıyor), bu yüzden gerçek birer bağlantı
// olmalılar: paylaşılabilir, yer imlenebilir ve geri tuşuyla gezilebilir.
//
// Koruma Havuzu bunu elle yazılmış nav+Link ile yapıyordu; Müfredat Akışı
// ise NativeSelect kullanıyordu. İkisi de buraya bağlanır.

export interface LinkTab {
  key: string
  label: string
  /**
   * Sekmenin hedefi.
   *
   * GRUP SEKMELERİNDE İSTEĞE BAĞLI (bkz. `items`): "Ödevler" ve
   * "Kaynaklar" tıklanınca varsayılan alt görünüme gider, "Diğer" ise
   * hiçbir yere gitmez — yalnız listesini açar.
   */
  href?: string
  /** Sekme etiketinin yanındaki sayı (ör. havuzdaki konu adedi). */
  count?: number
  /**
   * Alt görünümler. Doluysa sekme bir AİLE başlığıdır ve yanında açılır
   * liste oku çıkar (R7 / Site Testi 03).
   */
  items?: LinkTab[]
}

/** Aktif/pasif sekme görünümü — grup başlığı da aynı şeridi paylaşır. */
export function tabLinkClass(active: boolean) {
  return cn(
    // Aktif sekme yalnız renkle değil alt çizgiyle de ayrılır:
    // renk tek başına anlam taşımamalı.
    'shrink-0 border-b-2 px-3 py-2 text-sm transition-colors',
    active
      ? 'border-primary font-medium text-foreground'
      : 'border-transparent text-muted-foreground hover:text-foreground'
  )
}

export function LinkTabs({
  tabs,
  activeKey,
  action,
  ariaLabel = 'Ders seçimi',
  className,
}: {
  tabs: LinkTab[]
  activeKey: string
  /** Şeridin sağ ucundaki ek eylem ("+ Ders Ekle" gibi). */
  action?: React.ReactNode
  /**
   * Gezinme bölgesinin adı. Varsayılan "Ders seçimi" — bileşen bu iş için
   * yazılmıştı; öğrenci çalışma masası aynı şeridi ekran seçimi için
   * kullanıyor ve ekran okuyucuya "ders seçimi" demesi yanlış olurdu.
   */
  ariaLabel?: string
  className?: string
}) {
  if (tabs.length === 0) return null

  return (
    <div className={cn('flex items-center gap-2 border-b', className)}>
      <nav
        aria-label={ariaLabel}
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
      >
        {tabs.map(tab => {
          const active = tab.key === activeKey

          if (tab.items && tab.items.length > 0) {
            return (
              <TabGroupMenu key={tab.key} tab={tab} active={active} />
            )
          }

          // Grup değil ve hedefi de yoksa gidilecek bir yer yok; boş bir
          // etiket basmaktansa sekmeyi hiç göstermemek doğru.
          if (!tab.href) return null

          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={tabLinkClass(active)}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                  {tab.count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
      {action && <div className="shrink-0 pb-1">{action}</div>}
    </div>
  )
}
