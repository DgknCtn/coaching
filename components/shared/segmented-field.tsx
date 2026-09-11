'use client'

import { cn } from '@/lib/utils'

/**
 * İki–dört seçenekli tercih için segmentli düğme grubu.
 *
 * NEDEN AÇILIR LİSTE DEĞİL: "Ders mi koçluk mu", "birebir mi grup mu",
 * "online mı yüz yüze mi" — her biri iki seçenekli. Açılır liste bunu üç
 * eyleme çıkarıyor (aç, gez, seç) ve seçenekleri kapalı tutuyor;
 * öğretmen neyi seçebileceğini görmek için önce açmak zorunda kalıyor.
 * Segmentli grupta bütün seçenekler görünür ve seçim tek tık.
 *
 * ÜÇTEN FAZLA SEÇENEKTE KULLANMAYIN: segmentler dar ekranda taşar,
 * etiketler kısaltılmak zorunda kalır ve okunurluk açılır listenin
 * altına düşer. Gün seçimi (7 seçenek) bu yüzden `NativeSelect` olarak
 * kalıyor.
 *
 * ERİŞİLEBİLİRLİK: `role="radiogroup"` + `role="radio"`. Sekme tuşu
 * gruba bir kez girer (seçili olan odaklanır), ok tuşları seçenekler
 * arasında gezer ve GEZERKEN SEÇER — yerel radyo düğmelerinin
 * davranışı budur; kullanıcı ok tuşuna basınca ayrıca boşluk tuşuna
 * basmak zorunda kalmaz.
 */

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

/**
 * Ok tuşunun götüreceği sıra numarası.
 *
 * Bileşenden AYRI ve saf: repoda jsdom kurulumu yok (vitest `node`
 * ortamında koşuyor), dolayısıyla klavye davranışı ancak bu hesap
 * dışarı alındığında test edilebilir. Uçlarda sarmalama ve boş listede
 * çökmeme kuralları burada kilitleniyor.
 */
export function nextSegmentIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return -1
  // Değer listede yoksa (`findIndex` -1 döndürdü) imleç listenin
  // DIŞINDA sayılır: sağ ok ilk seçeneğe, sol ok sonuncuya gider.
  // Modulo'ya bırakılsaydı sol ok ikinci seçeneği seçerdi — sıra
  // numarası eksi birden geriye gitmenin anlamlı bir karşılığı yok.
  if (current < 0) return delta > 0 ? 0 : length - 1
  return (((current + delta) % length) + length) % length
}

export function SegmentedField<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  className,
}: {
  label: string
  options: SegmentOption<T>[]
  value: T
  onChange: (next: T) => void
  disabled?: boolean
  className?: string
}) {
  const index = options.findIndex((o) => o.value === value)

  function move(delta: number) {
    if (disabled || options.length === 0) return
    // Uçlarda sarmalanır: son seçenekten sağ ok ilkine döner. Sarmalama
    // olmasaydı ok tuşu sessizce hiçbir şey yapmayan bir tuşa dönerdi.
    const next = nextSegmentIndex(index, delta, options.length)
    if (next < 0) return
    onChange(options[next].value)
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <span className="text-sm font-medium">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex rounded-md border border-border p-0.5"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault()
            move(1)
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault()
            move(-1)
          }
        }}
      >
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              // Seçili olan sekme sırasında; diğerleri ok tuşlarıyla
              // gezilir. Hepsi tabbable olsaydı yedi alanlı bir form
              // on dört sekmeye çıkardı.
              tabIndex={active ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex-1 rounded px-3 py-1.5 text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
