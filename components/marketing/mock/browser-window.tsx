import { cn } from '@/lib/utils'

// Ürün ekranı çerçevesi — landing mockup'larının ortak kabı. Sahte pencere
// çubuğu kartın bir "ekran" olduğunu okutur. İçerik etkileşimsizdir
// (aria-hidden): bu bir ürün görüntüsü, kullanılabilir bir form değil.

export function BrowserWindow({
  title,
  label,
  children,
  className,
}: {
  /** Pencere çubuğundaki ekran adı: "Ödev Ver", "Ders & Görüşmeler". */
  title: string
  /** Ekran okuyucu için ekranın ne gösterdiği. */
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <figure className={cn('overflow-hidden rounded-xl border bg-card shadow-xl shadow-primary/5', className)}>
      <div className="flex items-center gap-1.5 border-b bg-muted/40 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-destructive/40" />
        <span className="size-2.5 rounded-full bg-warning/40" />
        <span className="size-2.5 rounded-full bg-success/40" />
        <span className="ml-3 truncate text-xs text-muted-foreground">{title}</span>
      </div>
      <div aria-hidden className="pointer-events-none select-none">
        {children}
      </div>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  )
}
