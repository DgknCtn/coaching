import type { LucideIcon } from 'lucide-react'
import { GraduationCap, Lock, UserCheck, Users } from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { BrandMark } from '@/components/shared/brand-mark'

interface AuthShellProps {
  title: string
  description: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** Sağ karttaki başlığın üstündeki küçük rozet. Verilmezse gösterilmez. */
  badge?: string
  /** Rozetin ikonu. Varsayılan kilit; güvenlikle ilgisi olmayan rozetlerde değiştirin. */
  badgeIcon?: LucideIcon
  /** Sol paneldeki tanıtım içeriği. Verilmezse giriş odaklı varsayılan. */
  hero?: {
    eyebrow: string
    title: React.ReactNode
    /** Başlığın altındaki cümle. Verilmezse yalnız başlık görünür. */
    description?: string
  }
}

/**
 * Giriş/kayıt/davet ekranlarının ortak kabuğu.
 *
 * Solda ürünü anlatan tanıtım paneli, sağda yüzen form kartı. Tanıtım
 * paneli yalnız lg ve üstünde görünür: dar ekranda formu aşağı iterek
 * kullanıcıyı kaydırmaya zorlardı. Mobilde marka satırı kartın içine
 * taşınır, yoksa ekranda hiç marka kalmazdı.
 */

// Üç panel kartı; sol tanıtımın tek değişmeyen parçası olduğu için
// bileşen dışında sabit duruyor, her render'da yeniden kurulmuyor.
//
// Metinler middleware'deki gerçek rol alanlarını anlatıyor
// (/teacher, /student, /parent) — giriş ekranında verilen söz ile
// giriş sonrası görülen ekran birbirini tutmalı.
const PANELS = [
  {
    icon: UserCheck,
    title: 'Öğretmen',
    description: 'Öğrenci listesi, ödev dağıtımı ve haftalık ilerleme',
  },
  {
    icon: GraduationCap,
    title: 'Öğrenci',
    description: 'Kendi programı, ödevleri ve çözdüğü testler',
  },
  {
    icon: Users,
    title: 'Veli',
    description: 'Yalnız kendi öğrencisinin ilerlemesi, düzenleme yetkisi yok',
  },
] as const

const DEFAULT_HERO = {
  eyebrow: 'Öğrenci, ödev ve kitap takibi tek ekranda',
  title: (
    <>
      Geride kalan öğrenciyi <span className="text-sidebar-primary">hafta bitmeden</span> görün.
    </>
  ),
}

export function AuthShell({
  title,
  description,
  children,
  footer,
  badge,
  badgeIcon: BadgeIcon = Lock,
  hero = DEFAULT_HERO,
}: AuthShellProps) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 xl:p-14 lg:flex">
        {/* Dekoratif: içeriği taşımadığı için ekran okuyucudan gizli. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-32 size-96 rounded-full bg-sidebar-primary/15 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <BrandMark size={32} />
          <span className="text-sm font-semibold text-sidebar-foreground">{BRAND.name}</span>
        </div>

        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent/50 px-3 py-1 text-xs text-sidebar-foreground/80">
            <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
            {hero.eyebrow}
          </span>

          <p className="mt-6 max-w-lg text-4xl font-semibold leading-[1.15] tracking-tight text-sidebar-foreground xl:text-5xl">
            {hero.title}
          </p>

          {hero.description && (
            <p className="mt-5 max-w-md text-sm leading-relaxed text-sidebar-foreground/70">
              {hero.description}
            </p>
          )}

          <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
            {PANELS.map((panel) => (
              <div key={panel.title} className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-4">
                <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary/15 text-sidebar-primary">
                  <panel.icon className="size-4" aria-hidden />
                </div>
                <p className="mt-3 text-sm font-medium text-sidebar-foreground">{panel.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-sidebar-foreground/60">
                  {panel.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-sidebar-foreground/50">
          © {BRAND.since} {BRAND.name}
        </p>
      </div>

      <div className="flex min-h-screen items-center justify-center bg-background p-6 md:p-10 lg:min-h-0">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl shadow-black/5 sm:p-8">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <BrandMark size={32} />
            <span className="text-sm font-semibold">{BRAND.name}</span>
          </div>

          <div className="mb-7">
            {badge && (
              <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <BadgeIcon className="size-3" aria-hidden />
                {badge}
              </span>
            )}
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
          </div>

          {children}

          {footer && <div className="mt-8">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
