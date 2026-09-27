import { Badge } from '@/components/ui/badge'
import { STATUS_LABEL, type StudentStatus } from '@/lib/student-status'

// ÖĞRENCİ DURUM ROZETİ — panel tablosu, landing ve demo AYNI rozeti kullanır.
//
// Etiket `STATUS_LABEL`'dan (lib/student-status.ts) gelir. Önceden landing
// ve demo eski üçlü sözlüğü ("İyi / Dikkat / Kritik") elle yazıyordu; ürün
// ise dörtlü sözlükle (Yolunda / Takip Et / Geride / Müdahale Gerekli)
// çalışıyordu. Ziyaretçi vitrinde bir kelime, kayıttan sonra başka bir
// kelime görüyordu.
//
// Renk YALNIZ sinyal verir; anlamı etiket taşır.
export const STUDENT_STATUS_VARIANT: Record<
  StudentStatus,
  'success' | 'warning' | 'destructive'
> = {
  yolunda: 'success',
  takip_et: 'warning',
  geride: 'warning',
  mudahale: 'destructive',
}

export function StudentStatusBadge({
  status,
  className,
}: {
  status: StudentStatus
  className?: string
}) {
  return (
    <Badge variant={STUDENT_STATUS_VARIANT[status]} className={className}>
      <span className="size-1.5 shrink-0 rounded-full bg-current opacity-70" />
      {STATUS_LABEL[status]}
    </Badge>
  )
}
