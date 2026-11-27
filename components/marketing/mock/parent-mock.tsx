import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { StudentStatusBadge } from '@/components/shared/student-status-badge'
import { PhoneFrame } from '../phone-frame'

// VELİ PANELİ — öğretmenin ONAYLADIĞI veri: onaylı/teslim ayrımı, geciken
// iş, kitap ilerlemesi. Veli hiçbir şeyi değiştiremez.

const BOOKS = [
  { title: 'TYT Matematik', pct: 67 },
  { title: 'TYT Türkçe', pct: 75 },
  { title: 'AYT Fizik', pct: 17 },
]

export function ParentMock() {
  return (
    <PhoneFrame label="Veli paneli: bu haftanın onaylı çalışmaları, geciken iş ve kitap ilerlemesi">
      <div className="space-y-3 px-4 pb-5">
        <div>
          <p className="text-[11px] text-muted-foreground">Veli paneli</p>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="text-base font-semibold tracking-tight">Ayşe Y.</p>
            <StudentStatusBadge status="yolunda" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border bg-card p-2">
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <CheckCircle2 className="size-3 text-success-foreground" />
              Öğretmen onaylı
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">7/8</p>
          </div>
          <div className="rounded-lg border bg-card p-2">
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <AlertTriangle className="size-3 text-destructive-foreground" />
              Geciken
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">1</p>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">Kitap ilerlemesi</p>
          <ul className="mt-2 space-y-2">
            {BOOKS.map(b => (
              <li key={b.title}>
                <div className="flex justify-between text-[11px]">
                  <span>{b.title}</span>
                  <span className="tabular-nums text-muted-foreground">%{b.pct}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${b.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PhoneFrame>
  )
}
