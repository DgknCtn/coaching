// Çalışma masası sekmelerinin yükleme durumu.
//
// Bu dosyanın asıl işi, (dashboard)/loading.tsx'i DEVRE DIŞI BIRAKMAK:
// o iskelet sayfanın tamamını (başlık dahil) griye çeviriyor ve sekmeler
// arası her geçiş tam bir sayfa değişimi gibi görünüyordu. Burada yalnız
// içerik alanı iskeletlenir; öğrenci başlığı ve sekme şeridi layout'ta
// olduğu için yerinde kalır.
export default function StudentWorkbenchLoading() {
  return (
    <div
      className="animate-pulse space-y-6 p-6 md:p-8"
      aria-busy="true"
      aria-label="Yükleniyor"
    >
      <div className="h-6 w-40 rounded-md bg-muted" />
      <div className="h-24 rounded-lg bg-muted" />
      <div className="h-64 rounded-lg bg-muted" />
    </div>
  )
}
