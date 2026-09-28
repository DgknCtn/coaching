// KÜÇÜK EĞİLİM ÇİZGİSİ — KPI kartının içinde (dataviz: stat tile trend).
//
// Süs değil, yardımcı: değer kartta yazıyor, bu yalnız yönü gösterir;
// bu yüzden ekran okuyucudan gizli (aria-hidden). Sunucu bileşeni —
// etkileşim yok. Son nokta vurgulu.

export function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null
  const max = Math.max(1, ...values)
  const stepX = width / (values.length - 1)
  const y = (v: number) => height - 2 - (v / max) * (height - 4)
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = values[values.length - 1]
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={d} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={y(last)} r={2.5} className="fill-chart-1" />
    </svg>
  )
}
