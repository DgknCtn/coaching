// Migration 161 uygulanmadan yeni bölüm açılırsa: sayfa bozulmaz, kısa
// bir bilgi gösterilir.
export function ModuleUnavailable() {
  return (
    <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
      Hata defteri bu panelde henüz etkin değil. Kısa süre sonra yeniden deneyin.
    </p>
  )
}
