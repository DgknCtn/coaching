import Link from 'next/link'
import { cn } from '@/lib/utils'

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
  href: string
  /** Sekme etiketinin yanındaki sayı (ör. havuzdaki konu adedi). */
  count?: number
}

export function LinkTabs({
  tabs,
  activeKey,
  action,
  className,
}: {
  tabs: LinkTab[]
  activeKey: string
  /** Şeridin sağ ucundaki ek eylem ("+ Ders Ekle" gibi). */
  action?: React.ReactNode
  className?: string
}) {
  if (tabs.length === 0) return null

  return (
    <div className={cn('flex items-center gap-2 border-b', className)}>
      <nav
        aria-label="Ders seçimi"
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
      >
        {tabs.map(tab => {
          const active = tab.key === activeKey
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                // Aktif sekme yalnız renkle değil alt çizgiyle de ayrılır:
                // renk tek başına anlam taşımamalı.
                'shrink-0 border-b-2 px-3 py-2 text-sm transition-colors',
                active
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
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
