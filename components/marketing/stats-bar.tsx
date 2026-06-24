export function StatsBar() {
  const stats = [
    { value: '500+', label: 'Aktif Öğrenci' },
    { value: '50+', label: 'Koç & Öğretmen' },
    { value: '10.000+', label: 'Ödev Takibi' },
    { value: '%94', label: 'Memnuniyet' },
  ]

  return (
    <section className="border-y border-border bg-muted/30">
      <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-0 md:divide-x md:divide-border">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center px-6">
            <div
              className="text-3xl sm:text-4xl font-black tracking-tight mb-1"
              style={{
                background:
                  'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {stat.value}
            </div>
            <div className="text-sm text-muted-foreground font-medium">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
