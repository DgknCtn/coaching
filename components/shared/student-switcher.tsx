'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SwitcherStudent {
  id: string
  fullName: string
  gradeLevel: string | null
  examType: string | null
}

/**
 * Sidebar'daki aktif öğrenci seçici.
 *
 * Zoom görüşmesinde eğitmen öğrenciler arasında hızlıca geçmek ister. Seçim
 * yapıldığında GEÇERLİ ALT ROTA korunur: /teacher/students/<a>/homework/new
 * üzerindeyken başka bir öğrenciye geçince aynı ekranın o öğrenci hâli açılır.
 */
export function StudentSwitcher({
  students,
  activeStudentId,
}: {
  students: SwitcherStudent[]
  activeStudentId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const active = students.find(s => s.id === activeStudentId)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(studentId: string) {
    setOpen(false)
    if (studentId === activeStudentId) return
    // Yalnız öğrenci kimliğini değiştir; alt rota (books/..., homework/new)
    // olduğu gibi kalsın.
    const next = pathname.replace(
      `/teacher/students/${activeStudentId}`,
      `/teacher/students/${studentId}`
    )
    router.push(next)
  }

  if (!active) return null

  const subtitle = [active.gradeLevel, active.examType].filter(Boolean).join(' · ')

  return (
    <div ref={containerRef} className="relative px-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2.5 rounded-lg bg-sidebar-accent/60 px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
          {active.fullName.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-sidebar-foreground">
            {active.fullName}
          </span>
          {subtitle && (
            <span className="block truncate text-xs text-sidebar-foreground/60">{subtitle}</span>
          )}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-foreground/60" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Öğrenci seç"
          // Zemin sidebar ile aynı renkte kalırsa liste arka planla birleşir;
          // bir tık açık yüzey + belirgin gölge ile katman hissi veriliyor.
          className="absolute inset-x-3 z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-sidebar-border bg-sidebar-accent py-1 shadow-xl shadow-black/40"
        >
          {students.map(student => {
            const isActive = student.id === activeStudentId
            return (
              <li key={student.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => pick(student.id)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                    isActive
                      ? 'font-medium text-sidebar-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar/60 hover:text-sidebar-foreground'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{student.fullName}</span>
                  {isActive && <Check className="size-3.5 shrink-0" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
