import { cn } from '@/lib/utils'

// TELEFON ÇERÇEVESİ — yalnız CSS, görsel dosyası yok.
//
// Öğrenci ve veli ürünü telefonda kullanıyor; landing yalnız masaüstü koç
// panelini gösterdiğinde bu hiç anlatılmıyordu. Çerçeve token'larla
// çizildiği için koyu temada da doğru görünür.

export function PhoneFrame({
  children,
  className,
  label,
}: {
  children: React.ReactNode
  className?: string
  /** Ekranın ne olduğu — ekran okuyucu için figcaption'da. */
  label: string
}) {
  return (
    <figure className={cn('w-[260px] shrink-0', className)}>
      <div className="rounded-[2.25rem] border-[6px] border-foreground/85 bg-foreground/85 shadow-2xl shadow-primary/10">
        <div className="relative overflow-hidden rounded-[1.75rem] bg-background">
          {/* Çentik */}
          <div
            aria-hidden
            className="absolute left-1/2 top-1.5 z-10 h-4 w-20 -translate-x-1/2 rounded-full bg-foreground/85"
          />
          {/* İçerik bir ürün görüntüsü; bağlantı ya da düğme içermez. */}
          <div aria-hidden className="pt-7">
            {children}
          </div>
        </div>
      </div>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  )
}
