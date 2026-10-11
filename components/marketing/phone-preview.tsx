import { Check, Clock, Circle } from 'lucide-react'
import { demoStudents } from './demo/demo-students'
import { PhoneFrame } from './phone-frame'
import { cn } from '@/lib/utils'

// TELEFONDA ÖĞRENCİ — "Haftam"ın sadeleştirilmiş temsili.
//
// Kitap ilerlemesi demo fikstüründen (demo-students.ts), panel önizlemesi
// ile aynı öğrenci. Görev durumları ürünün dilini kullanıyor:
// "Teslim ettin" öğrencinin işareti, "Onaylandı" öğretmenin onayı —
// ilerlemeye yalnız onaylı iş sayılır.

const student = demoStudents[0]

const WEEK: { title: string; detail: string; state: 'approved' | 'submitted' | 'todo' }[] = [
  { title: 'TYT Matematik', detail: 'Denklemler · Test 4-6', state: 'approved' },
  { title: 'TYT Türkçe', detail: 'Paragraf · 12 sayfa', state: 'submitted' },
  { title: 'TYT Matematik', detail: 'Problemler · Test 1-3', state: 'todo' },
]

const STATE = {
  approved: { label: 'Onaylandı', Icon: Check, className: 'text-success-foreground' },
  submitted: { label: 'Teslim ettin', Icon: Clock, className: 'text-warning-foreground' },
  todo: { label: 'Bu hafta', Icon: Circle, className: 'text-muted-foreground' },
} as const

export function PhonePreview({ className }: { className?: string }) {
  return (
    <PhoneFrame
      className={className}
      label="Öğrencinin telefondaki Haftam ekranı: bu haftanın görevleri ve kitap ilerlemesi"
    >
      <div className="px-4 pb-5">
        <p className="text-[11px] text-muted-foreground">Merhaba {student.name.split(' ')[0]}</p>
        <p className="text-base font-semibold tracking-tight">Haftam</p>

        <ul className="mt-3 space-y-2">
          {WEEK.map((w) => {
            const s = STATE[w.state]
            return (
              <li key={w.detail} className="rounded-lg border bg-card px-3 py-2">
                <p className="text-xs font-medium">{w.title}</p>
                <p className="text-[11px] text-muted-foreground">{w.detail}</p>
                <p className={cn('mt-1 flex items-center gap-1 text-[11px] font-medium', s.className)}>
                  <s.Icon className="size-3" />
                  {s.label}
                </p>
              </li>
            )
          })}
        </ul>

        <p className="mt-4 text-[11px] font-medium text-muted-foreground">Kitaplarım</p>
        <ul className="mt-2 space-y-2.5">
          {student.bookProgress.map((b) => {
            const pct = Math.round((b.done / b.total) * 100)
            return (
              <li key={b.title}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[11px]">{b.title}</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">%{pct}</p>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </PhoneFrame>
  )
}
