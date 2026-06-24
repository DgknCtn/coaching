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
    <div className="space-y-5 sm:space-y-6">
      {/* Tab switcher — icon-only pills on mobile, full cards on sm+ */}
      <div className="flex gap-2 sm:gap-3 sm:flex-row">
        {tabs.map((tab) => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={cn(
                'flex-1 transition-all duration-200',
                /* Mobile: compact pill */
                'flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-center',
                /* Desktop: full card with description */
                'sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-3.5 sm:rounded-2xl sm:text-left',
                isActive
                  ? 'border-transparent text-white shadow-lg'
                  : 'bg-card border-border hover:border-primary/30 hover:shadow-md'
              )}
              style={
                isActive
                  ? {
                      background:
                        'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))',
                    }
                  : {}
              }
            >
              <div
                className={cn(
                  'w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0',
                  isActive ? 'bg-white/20' : 'bg-muted'
                )}
              >
                <tab.Icon
                  className={cn('size-4 sm:size-5', isActive ? 'text-white' : 'text-muted-foreground')}
                />
              </div>
              <div className="min-w-0">
                {/* Short label on mobile, full label on desktop */}
                <div
                  className={cn(
                    'text-xs sm:text-sm font-bold leading-tight',
                    isActive ? 'text-white' : ''
                  )}
                >
                  <span className="sm:hidden">{tab.label}</span>
                  <span className="hidden sm:inline">{tab.fullLabel}</span>
                </div>
                <div
                  className={cn(
                    'hidden sm:block text-xs leading-tight mt-0.5',
                    isActive ? 'text-white/65' : 'text-muted-foreground'
                  )}
                >
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
