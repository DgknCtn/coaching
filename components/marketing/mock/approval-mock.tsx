import { ArrowRight, Check, RotateCcw } from 'lucide-react'
import { BrowserWindow } from './browser-window'

// ÖĞRETMEN ONAYI — öğrenci beyanı → öğretmen onayı → ilerleme. Kural
// (PRD §6.7): "tamamlandı" beyanı tek başına ilerlemeye sayılmaz.

const PENDING = [
  { student: 'Ayşe Y.', work: 'Denklemler · Test 4-6', when: 'Bugün 21:14' },
  { student: 'Mehmet K.', work: 'Paragraf · sf. 12-20', when: 'Dün 19:02' },
]

export function ApprovalMock() {
  return (
    <BrowserWindow
      title="Onay bekleyenler"
      label="Öğretmen onayı: öğrencinin teslim ettiği çalışmalar onaylanınca ilerleme yüzdesi güncellenir"
    >
      <ul className="divide-y text-sm">
        {PENDING.map((p, i) => (
          <li key={p.work} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{p.student}</p>
              <p className="text-xs text-muted-foreground">
                {p.work} · teslim {p.when}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground">
              <RotateCcw className="size-3" />
              İade et
            </span>
            <span
              className={
                i === 0
                  ? 'inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground ring-2 ring-primary/30'
                  : 'inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground'
              }
            >
              <Check className="size-3" />
              Onayla
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3 border-t bg-muted/30 px-4 py-3 text-xs">
        <span className="font-medium">TYT Matematik ilerlemesi</span>
        <span className="tabular-nums text-muted-foreground">%62</span>
        <ArrowRight className="size-3.5 text-primary" />
        <span className="tabular-nums font-semibold text-success-foreground">%66</span>
        <div className="h-1.5 min-w-24 flex-1 rounded-full bg-muted">
          <div className="h-1.5 rounded-full bg-primary" style={{ width: '66%' }} />
        </div>
      </div>
      <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
        Öğrenci &quot;yaptım&quot; dediğinde yüzde değişmez; yalnız onayladığınız iş kayda geçer.
      </p>
    </BrowserWindow>
  )
}
