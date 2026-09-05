'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/status-badge'
import { MetricRow } from '@/components/shared/metric-row'
import { Section } from '@/components/shared/section'
import { ProgressBar } from '@/components/shared/progress-bar'
import { academicYearLabel, demoRelative } from '@/lib/demo-data'
import { cn } from '@/lib/utils'
import { demoStudents, type DemoStudent } from './demo-students'
import { StudentDetailPanel } from './student-detail-panel'

// KOÇ PANELİ DEMOSU.
//
// ============================================================
// NEDEN KENDİ TABLOSU VAR (paylaşılan DataTable değil)
//
// DataTable satır tıklamasını yalnız `rowHref` ile destekliyor: satırın
// üstüne mutlak konumlu bir Link seriyor. Burada gidilecek bir rota yok,
// aynı sayfada seçim yapılıyor. Paylaşılan bileşene yalnız demo için
// `onRowClick` eklemek, onu kullanan altı üretim ekranını da etkilerdi;
// bir vitrin ihtiyacı için üretim bileşenini genişletmek doğru takas
// değil.
//
// Satırın tamamını tıklanabilir yapan desen DataTable'dan alındı: ilk
// hücreye mutlak konumlu bir <button> seriliyor. `<tr>` içine buton
// koymak geçersiz HTML olmadığı için sarmalama gerekmiyor ve düğmenin
// erişilebilir bir adı var.
// ============================================================

const COLUMN_CLASS = 'px-3 py-2.5 text-left align-middle'

export function TeacherDemo() {
  // Varsayılan seçim YOK. Panel açık başlasaydı ziyaretçi tablonun
  // tıklanabilir olduğunu fark etmezdi; kapalı başlayınca ilk tıklama
  // keşfin kendisi oluyor.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected: DemoStudent | undefined = demoStudents.find((s) => s.id === selectedId)

  return (
    <div className="space-y-6">
      {/* SAYI DEĞİL, SORU. "Risk altında 3" bir veritabanı sayımı;
          "Kritik Öğrenci — müdahale gereken öğrenciler" öğretmenin
          zihninde bir iş. Kelime ürünün kendi rozet sözlüğünden
          (status-badge.tsx): kullanıcı kaydolduktan sonra AYNI kelimeyi
          görüyor, demoya özel bir dil uydurulmuyor. */}
      <MetricRow
        metrics={[
          { label: 'Aktif Öğrenci', value: 24 },
          { label: 'Bu Haftaki Görev Tamamlama', value: '74%' },
          { label: 'Geciken Görev', value: 11 },
          {
            label: 'Kritik Öğrenci',
            value: 3,
            hint: 'Müdahale gereken öğrenciler',
          },
        ]}
      />

      <Section
        title="Öğrenciler"
        description={`${academicYearLabel()} YKS dönemi · Ayrıntı için bir öğrenciye dokunun`}
        variant="card"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th scope="col" className={COLUMN_CLASS}>
                  Öğrenci
                </th>
                <th scope="col" className={cn(COLUMN_CLASS, 'hidden sm:table-cell')}>
                  Sınav
                </th>
                <th scope="col" className={cn(COLUMN_CLASS, 'hidden md:table-cell')}>
                  Ödevler
                </th>
                <th scope="col" className={cn(COLUMN_CLASS, 'hidden lg:table-cell')}>
                  Son Aktivite
                </th>
                <th scope="col" className={cn(COLUMN_CLASS, 'hidden md:table-cell w-40')}>
                  İlerleme
                </th>
                <th scope="col" className={cn(COLUMN_CLASS, 'text-center')}>
                  Durum
                </th>
              </tr>
            </thead>
            <tbody>
              {demoStudents.map((s) => {
                const isSelected = s.id === selectedId
                return (
                  <tr
                    key={s.id}
                    className={cn(
                      'relative border-b transition-colors last:border-0',
                      isSelected ? 'bg-primary/5' : 'hover:bg-muted/40'
                    )}
                  >
                    <td className={COLUMN_CLASS}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(isSelected ? null : s.id)}
                        aria-expanded={isSelected}
                        className="absolute inset-0 z-10 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="sr-only">
                          {isSelected
                            ? `${s.name} ayrıntısını kapat`
                            : `${s.name} ayrıntısını aç`}
                        </span>
                      </button>
                      <div className="relative">
                        <p className="font-medium">{s.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{s.grade}</p>
                      </div>
                    </td>
                    <td className={cn(COLUMN_CLASS, 'hidden sm:table-cell')}>
                      <Badge variant="neutral">{s.exam}</Badge>
                    </td>
                    <td className={cn(COLUMN_CLASS, 'hidden md:table-cell tabular-nums')}>
                      {s.doneTasks}
                      <span className="text-muted-foreground">/{s.totalTasks}</span>
                    </td>
                    <td
                      className={cn(
                        COLUMN_CLASS,
                        'hidden lg:table-cell text-muted-foreground'
                      )}
                    >
                      {demoRelative(s.lastActiveDays)}
                    </td>
                    <td className={cn(COLUMN_CLASS, 'hidden md:table-cell')}>
                      <div className="flex items-center gap-3">
                        <ProgressBar
                          value={s.completion}
                          label={`${s.name} ilerlemesi`}
                          className="w-20"
                        />
                        <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                          {s.completion}%
                        </span>
                      </div>
                    </td>
                    <td className={cn(COLUMN_CLASS, 'text-center')}>
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {selected && <StudentDetailPanel student={selected} />}
    </div>
  )
}
