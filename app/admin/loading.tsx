// Yönetim segmentinin yükleme durumu.
//
// app/(dashboard)/loading.tsx bu segmenti KAPSAMIYOR — /admin ayrı bir
// route grubunda. Yönetim sayfalarının hepsi force-dynamic olduğu için
// her gezinmede sorgular bitene kadar ekran tamamen boş kalıyordu.
//
// Sekme çubuğu layout'ta olduğundan burada tekrarlanmıyor: yalnız içerik
// alanının iskeleti çizilir, sekmeler yerinde kalır.
export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Yükleniyor">
      <div className="h-7 w-48 rounded-md bg-muted" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-72 rounded-lg bg-muted" />
    </div>
  )
}
