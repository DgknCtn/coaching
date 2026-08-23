'use client'

// Açık / koyu tema düğmesi.
//
// İki durumlu, bilinçli olarak: sistem tercihi izlenmiyor (bkz.
// theme-provider.tsx), dolayısıyla üçüncü bir "Sistem" seçeneği yok.
//
// Hidrasyon notu: tema sunucuda bilinmez (localStorage'da). İkonu doğrudan
// render etmek sunucu/istemci uyuşmazlığı üretir. Bu yüzden `mounted`
// olana kadar aynı boyutta nötr bir yer tutucu basılır — düzen zıplamaz.

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

type ToggleVariant = 'sidebar' | 'default'

// Sidebar açık temada da koyu olduğu için kendi token ailesini kullanır;
// navbar ise normal zemin token'larını.
const VARIANT_CLASS: Record<ToggleVariant, string> = {
  sidebar:
    'w-full gap-3 px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
  default:
    'gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
}

interface Props {
  variant?: ToggleVariant
  /** Sidebar'da etiket gösterilir; navbar'da yalnız ikon. */
  showLabel?: boolean
  className?: string
  onToggled?: () => void
}

export function ThemeToggle({
  variant = 'default',
  showLabel = false,
  className,
  onToggled,
}: Props) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === 'dark'
  const label = isDark ? 'Açık temaya geç' : 'Koyu temaya geç'

  const base = cn(
    'flex items-center rounded-md transition-colors disabled:opacity-40',
    VARIANT_CLASS[variant],
    className
  )

  // İlk render: tema henüz bilinmiyor. Aynı ölçüde boş bir kutu.
  if (!mounted) {
    return (
      <span aria-hidden className={base} style={{ visibility: 'hidden' }}>
        <Sun className="size-4 shrink-0" />
        {showLabel && 'Koyu tema'}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setTheme(isDark ? 'light' : 'dark')
        onToggled?.()
      }}
      aria-label={label}
      title={label}
      className={base}
    >
      {isDark ? <Sun className="size-4 shrink-0" /> : <Moon className="size-4 shrink-0" />}
      {showLabel && (isDark ? 'Açık tema' : 'Koyu tema')}
    </button>
  )
}
