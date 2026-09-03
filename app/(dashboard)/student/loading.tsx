import { Loader2 } from 'lucide-react'

// Öğrenci segmentinin kendi yükleme durumu.
//
// Önceden yalnız app/(dashboard)/loading.tsx devralınıyordu; öğrenci
// sayfaları force-dynamic olduğu için her gezinmede bekleme yaşanıyor ve
// ekran boş kalıyordu.
export default function StudentLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <span className="sr-only">Yükleniyor</span>
    </div>
  )
}
