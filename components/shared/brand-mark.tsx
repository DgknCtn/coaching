import Image from 'next/image'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * Marka işareti — sincap maskotu.
 *
 * Navbar, footer, sidebar ve auth ekranı aynı kutuyu üç ayrı yerde
 * kopyalıyordu (lucide `GraduationCap` + `bg-primary` kare). İşaret
 * değiştiğinde hepsini tek tek bulmak yerine tek bileşen okunuyor.
 *
 * Kaynak dosya `brand/izlogo.png`; buradaki PNG ondan üretiliyor
 * (`npm run icons`). Zemin krem — maskotun turuncusu `--primary`
 * üzerinde kaybolurdu.
 */
export function BrandMark({
  size = 32,
  className,
}: {
  /** Kenar uzunluğu (px). Sidebar 32, auth ekranı 28 kullanır. */
  size?: number
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[oklch(0.955_0.012_70)]',
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/icons/mark.png"
        alt={`${BRAND.name} logosu`}
        width={size}
        height={size}
        // İşaret dekoratif değil, marka kimliği; ama yanında her zaman
        // ürün adı yazdığı için alt metin kısa tutuldu.
        className="size-[86%] object-contain"
        priority
      />
    </span>
  )
}
