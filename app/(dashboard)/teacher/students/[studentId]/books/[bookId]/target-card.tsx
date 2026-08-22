'use client'

// Hedef kartı (R4 §5).
//
// Arayüzde TEK aktif hedef vardır. Hedef 2 bu sürümde bilinçli olarak
// eklenmedi; şema (student_book_targets) buna hazır ama UI sade kalıyor.
//
// Kapsam değiştiğinde plan matematiği yeni kapsama göre yeniden hesaplanır:
// sayfa kaydedildikten sonra sunucu resolvePlanScope ile T/C'yi yeniden
// üretir, calculatePlanTempo'ya tek satır bile dokunulmaz.

import { useState, useTransition } from 'react'
import { Loader2, Save, Target } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { BookMapBook } from '@/lib/book-map'
import { sectionScopeLabel } from '@/lib/plan-scope'
import { setStudentBookTargetAction } from './target-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  studentId: string
  book: BookMapBook
}

type ScopeType = 'whole_book' | 'sections' | 'units'

export function TargetCard({ studentId, book }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const target = book.target
  const [startDate, setStartDate] = useState(target?.startDate ?? book.startDate ?? '')
  const [targetDate, setTargetDate] = useState(target?.targetDate ?? book.targetEndDate ?? '')
  const [scopeType, setScopeType] = useState<ScopeType>(target?.scopeType ?? 'whole_book')
  const [sectionIds, setSectionIds] = useState<string[]>(target?.sectionIds ?? [])

  const unitLabel = book.trackingMode === 'page' ? 'sayfa' : 'test'

  // Seçili kapsamın büyüklüğü — kaydetmeden önce ne planlandığını gösterir.
  const scopeSize =
    scopeType === 'whole_book'
      ? book.totalTests
      : scopeType === 'sections'
        ? book.sections
            .filter((s) => sectionIds.includes(s.id))
            .reduce((sum, s) => sum + s.tests.length, 0)
        : (target?.unitIds.length ?? 0)

  const toggleSection = (id: string) => {
    setSectionIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  const submit = () => {
    startTransition(async () => {
      const result = await setStudentBookTargetAction(studentId, book.bookId, {
        assignmentId: book.assignmentId,
        startDate: startDate || undefined,
        targetDate: targetDate || undefined,
        scopeType,
        sectionIds: scopeType === 'sections' ? sectionIds : [],
        // Birim kapsamı şu an yalnızca mevcut hedeften korunur; seçim
        // arayüzü kitap haritasında yapılır (R4 sonrası bekleme listesi).
        unitIds: scopeType === 'units' ? (target?.unitIds ?? []) : [],
      })
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success('Hedef güncellendi. Plan yeni kapsama göre hesaplandı.')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="size-4 text-muted-foreground" />
          Hedef
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="targetStart">Başlangıç tarihi</Label>
            <Input
              id="targetStart"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="targetEnd">Hedef bitiş tarihi</Label>
            <Input
              id="targetEnd"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="scopeType">Hedef kapsamı</Label>
          <NativeSelect
            id="scopeType"
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value as ScopeType)}
          >
            <option value="whole_book">Tüm kitap</option>
            <option value="sections">Seçili bölümler</option>
            {target?.scopeType === 'units' && (
              <option value="units">Seçili {unitLabel} ({target.unitIds.length})</option>
            )}
          </NativeSelect>
        </div>

        {scopeType === 'sections' && (
          <fieldset className="space-y-1.5 rounded-lg border p-3">
            <legend className="px-1 text-xs text-muted-foreground">Bölümler</legend>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {book.sections.map((section) => (
                <label key={section.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={sectionIds.includes(section.id)}
                    onChange={() => toggleSection(section.id)}
                  />
                  <span className="truncate">{section.title}</span>
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                    {sectionScopeLabel(section) || `${section.tests.length} ${unitLabel}`}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <p className="text-sm text-muted-foreground">
          Planlanan kapsam: <span className="font-medium tabular-nums">{scopeSize}</span> {unitLabel}
        </p>

        <Button type="button" onClick={submit} disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save />}
          Hedefi kaydet
        </Button>
      </CardContent>
    </Card>
  )
}
