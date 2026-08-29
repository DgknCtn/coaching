'use client'

// Hedef kartı (R4 §5 + R6-04).
//
// İKİ hedef türü vardır ve bilinçli olarak ayrıdır:
//
//   Kaynak Hedefi (resource) — nihai kapsam + nihai tarih. ANA TEMPO her
//     zaman bundan hesaplanır. Uzun vadelidir; sık değişmez.
//   Ara Hedef (interim)      — kısa menzilli, değiştirilebilir. Kaynak
//     Hedefinin kapsamını veya tarihini ASLA değiştirmez.
//
// Ara hedefin tamamlanması ana hedefin kalanını zaten azaltır (ikisi de aynı
// completion verisini okur), bu yüzden ana tempo kendiliğinden yeniden
// hesaplanır — aralarında ayrıca bir bağ kurulmaz.
//
// Kapsam değiştiğinde plan matematiği yeni kapsama göre yeniden hesaplanır:
// sayfa kaydedildikten sonra sunucu resolvePlanScope ile T/C'yi yeniden
// üretir, calculatePlanTempo'ya tek satır bile dokunulmaz.

import { useState, useTransition } from 'react'
import { unitLabel } from '@/lib/unit-labels'
import { Loader2, Save, Target, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { BookMapBook } from '@/lib/book-map'
import { sectionScopeLabel } from '@/lib/plan-scope'
import { clearStudentBookTargetAction, setStudentBookTargetAction } from './target-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  studentId: string
  book: BookMapBook
  /** resource (varsayılan) | interim — R6-04. */
  kind?: 'resource' | 'interim'
}

type ScopeType = 'whole_book' | 'sections' | 'units'

const KIND_COPY = {
  resource: {
    title: 'Kaynak Hedefi',
    hint: 'Kitabın nihai kapsamı ve tarihi. Güncel tempo her zaman bu hedeften hesaplanır.',
    saveLabel: 'Kaynak Hedefini kaydet',
    savedToast: 'Kaynak Hedefi güncellendi. Plan yeni kapsama göre hesaplandı.',
  },
  interim: {
    title: 'Ara Hedef',
    hint: 'Kısa menzilli hedef. Kaynak Hedefinin kapsamını ve tarihini değiştirmez.',
    saveLabel: 'Ara Hedefi kaydet',
    savedToast: 'Ara Hedef güncellendi. Kaynak Hedefi değişmedi.',
  },
} as const

export function TargetCard({ studentId, book, kind = 'resource' }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const copy = KIND_COPY[kind]
  const target = kind === 'interim' ? book.interimTarget : book.target
  const [startDate, setStartDate] = useState(target?.startDate ?? book.startDate ?? '')
  const [targetDate, setTargetDate] = useState(target?.targetDate ?? book.targetEndDate ?? '')
  const [scopeType, setScopeType] = useState<ScopeType>(target?.scopeType ?? 'whole_book')
  const [sectionIds, setSectionIds] = useState<string[]>(target?.sectionIds ?? [])


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
        kind,
        sectionIds: scopeType === 'sections' ? sectionIds : [],
        // Birim kapsamı şu an yalnızca mevcut hedeften korunur; seçim
        // arayüzü kitap haritasında yapılır (R4 sonrası bekleme listesi).
        unitIds: scopeType === 'units' ? (target?.unitIds ?? []) : [],
      })
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success(copy.savedToast)
      router.refresh()
    })
  }

  const clear = () => {
    startTransition(async () => {
      const result = await clearStudentBookTargetAction(
        studentId,
        book.bookId,
        book.assignmentId,
        kind
      )
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success(`${copy.title} kaldırıldı.`)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="size-4 text-muted-foreground" />
          {copy.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{copy.hint}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`targetStart-${kind}`}>Başlangıç tarihi</Label>
            <Input
              id={`targetStart-${kind}`}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`targetEnd-${kind}`}>Hedef bitiş tarihi</Label>
            <Input
              id={`targetEnd-${kind}`}
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`scopeType-${kind}`}>Hedef kapsamı</Label>
          <NativeSelect
            id={`scopeType-${kind}`}
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value as ScopeType)}
          >
            <option value="whole_book">Tüm kitap</option>
            <option value="sections">Seçili bölümler</option>
            {target?.scopeType === 'units' && (
              <option value="units">Seçili {unitLabel(book.trackingMode)} ({target.unitIds.length})</option>
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
                    {sectionScopeLabel(section) || `${section.tests.length} ${unitLabel(book.trackingMode)}`}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <p className="text-sm text-muted-foreground">
          Planlanan kapsam: <span className="font-medium tabular-nums">{scopeSize}</span> {unitLabel(book.trackingMode)}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={submit} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save />}
            {copy.saveLabel}
          </Button>
          {target && (
            <Button type="button" variant="outline" onClick={clear} disabled={isPending}>
              <Trash2 className="size-4" />
              Kaldır
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
