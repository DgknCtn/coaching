export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-8 p-6 md:p-8" aria-busy="true" aria-label="Yükleniyor">
      <div className="h-7 w-56 rounded-md bg-muted" />
      <div className="h-24 rounded-lg bg-muted" />
      <div className="h-64 rounded-lg bg-muted" />
    </div>
  )
}
