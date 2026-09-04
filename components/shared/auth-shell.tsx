import { GraduationCap } from 'lucide-react'
import { BRAND } from '@/lib/brand'

interface AuthShellProps {
  title: string
  description: string
  children: React.ReactNode
  footer?: React.ReactNode
}

/**
 * Giriş/kayıt/davet ekranlarının ortak kabuğu. Sol panel düz sidebar yüzeyi —
 * gradient, glow ve dot-grid dekorasyonu bilinçli olarak yok.
 */
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-[420px] shrink-0 flex-col justify-between bg-sidebar p-10 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-accent">
            <GraduationCap className="size-4 text-sidebar-foreground" />
          </div>
          <span className="text-sm font-semibold text-sidebar-foreground">{BRAND.name}</span>
        </div>

        <div>
          <p className="text-xl font-semibold leading-snug tracking-tight text-sidebar-foreground">
            Öğrencilerinizi tek yerden takip edin.
          </p>
          <p className="mt-3 max-w-xs text-sm text-sidebar-foreground/60">
            Kitaplar, testler, ödevler ve veli iletişimi — Excel&apos;e gerek kalmadan.
          </p>
        </div>

        <p className="text-xs text-sidebar-foreground/60">
          © {BRAND.since} {BRAND.name}
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-background p-6 md:p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-8 items-center justify-center rounded-md bg-muted">
              <GraduationCap className="size-4 text-muted-foreground" />
            </div>
            <span className="text-sm font-semibold">{BRAND.name}</span>
          </div>

          <div className="mb-8">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>

          {children}

          {footer && <div className="mt-8">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
