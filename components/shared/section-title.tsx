import { Circle } from 'lucide-react'
import type { BookMapSection } from '@/lib/book-map'
import { hasActiveSignal, signalLabel } from '@/lib/curriculum-signal'
import { cn } from '@/lib/utils'

// Kitap Haritasında bölüm başlığı (R5.3 §5.2).
//
// MÜFREDAT SİNYALİ YALNIZ BURADA GÖSTERİLİR. Şartnamenin kuralları:
//   - Test/sayfa hücrelerinin mevcut R4 renklerine DOKUNULMAZ.
//   - Test hücrelerine ek müfredat simgesi KOYULMAZ.
//   - Bütün satır yoğun renkle BOYANMAZ.
//   - Eğitmen sol konu sütununa bakarak zaman sinyalini anlayabilmeli.
//
// Bu yüzden sinyal tek bir dolu daire + kalın yazıdan ibarettir:
//   ● Fonksiyonlar
//
// Renk tek başına anlam taşımaz; simgenin title/sr-only karşılığı da
// vardır. Sinyal SALT GÖRSELDİR: ödev oluşturmaz, kitabı Aktif yapmaz,
// hedef kapsamı değiştirmez, temas üretmez (§5.5).
//
// "Plan dışı" AYRI bir bilgidir ve sinyalle birlikte görünebilir (§5.3
// matrisi): bir bölüm hem müfredat zamanı gelmiş hem de bu kitabın hedef
// kapsamı dışında olabilir. İkisi birbirini bastırmaz.

export function SectionTitle({
  section,
  outOfScope = false,
  className,
}: {
  section: Pick<
    BookMapSection,
    'title' | 'groupLabel' | 'themeLabel' | 'curriculumStatus' | 'partTitle'
  >
  /** Bölüm bu kitabın hedef kapsamı dışında mı? (R5.3 §5.4) */
  outOfScope?: boolean
  className?: string
}) {
  const active = hasActiveSignal(section.curriculumStatus)
  const label = signalLabel(section.curriculumStatus)
  // R7-02 §6.4: Parça adı meta satırının BAŞINDA durur — sayfa bazlı
  // kaynaklarda bölümün hangi fasikülde olduğu, seçim yaparken bağlamın
  // kendisidir (§1.4: F2 sf.5 ile F3 sf.5 aynı şey değildir).
  // groupLabel/themeLabel R6-17'den kalan eski etiketlerdir; yeni kayıtlarda
  // boştur ve Parça onların yerini alır.
  const meta = [section.partTitle, section.groupLabel, section.themeLabel]
    .filter(Boolean)
    .join(' · ')

  return (
    <span className={cn('flex min-w-0 items-start gap-1.5', className)}>
      {active && (
        <Circle
          aria-hidden
          className="mt-[3px] size-2 shrink-0 fill-primary text-primary"
        />
      )}
      <span className="min-w-0">
        <span className={cn('block truncate text-xs', active && 'font-semibold')}>
          {section.title}
          {active && label && <span className="sr-only"> — {label}</span>}
        </span>

        {(meta || outOfScope) && (
          <span className="block truncate text-[10px] text-muted-foreground">
            {[meta, outOfScope ? 'Plan dışı' : null].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
    </span>
  )
}
