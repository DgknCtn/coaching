'use client'

import { useState } from 'react'
import { GraduationCap, BookOpen, Users } from 'lucide-react'
import { TeacherDemo } from './teacher-demo'
import { StudentDemo } from './student-demo'
import { ParentDemo } from './parent-demo'
import { cn } from '@/lib/utils'

const tabs = [
  {
    id: 'teacher',
    label: 'Koç',
    fullLabel: 'Koç Görünümü',
    Icon: GraduationCap,
    description: 'Öğrencileri yönet, riskleri takip et',
  },
  {
    id: 'student',
    label: 'Öğrenci',
    fullLabel: 'Öğrenci Görünümü',
    Icon: BookOpen,
    description: 'Ödevler ve kitap ilerlemesi',
  },
  {
    id: 'parent',
    label: 'Veli',
    fullLabel: 'Veli Görünümü',
    Icon: Users,
    description: 'Çocuğunun gelişimini takip et',
  },
] as const

type TabId = (typeof tabs)[number]['id']

export function DemoTabs() {
  const [active, setActive] = useState<TabId>('teacher')

  return (
    <div className="space-y-6">
      <div className="flex gap-2" role="tablist" aria-label="Demo görünümü">
        {tabs.map((tab) => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.id)}
              className={cn(
                // Dar ekranda üç sekme yan yana sıkışıyor; iç boşluklar küçülür.
                'flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-3 text-left transition-colors sm:gap-3 sm:px-4',
                isActive
                  ? 'border-foreground/20 bg-muted'
                  : 'border-border bg-card hover:bg-muted/60'
              )}
            >
              <tab.Icon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-sm font-medium leading-tight">
                  <span className="sm:hidden">{tab.label}</span>
                  <span className="hidden sm:inline">{tab.fullLabel}</span>
                </div>
                <div className="mt-1 hidden text-xs text-muted-foreground sm:block">
                  {tab.description}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div>
        {active === 'teacher' && <TeacherDemo />}
        {active === 'student' && <StudentDemo />}
        {active === 'parent' && <ParentDemo />}
      </div>
    </div>
  )
}
