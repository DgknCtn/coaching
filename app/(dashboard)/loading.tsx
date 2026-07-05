export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse" aria-busy="true" aria-label="Yükleniyor">
      <div className="h-8 w-56 rounded-lg bg-muted" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-muted" />
    </div>
  )
}
