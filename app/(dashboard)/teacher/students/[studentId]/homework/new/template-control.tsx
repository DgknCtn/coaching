'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BookmarkPlus, LayoutTemplate, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import type { AcademicTask } from '@/lib/academic-tasks'
import { applyTemplateAction, deleteTemplateAction, saveTemplateAction } from './template-actions'

// ÖDEV ŞABLONLARI (PRD 10.3 · Faz 2d). Uygula → taslak görevler sepete;
// sepetteki taslak görevler → şablon. Yayın her zaman öğretmenin işi.

export interface TemplateRef {
  id: string
  name: string
  count: number
}

export function TemplateControl({
  studentId,
  templates,
  draftTasks,
}: {
  studentId: string
  /** null: şablon tablosu okunamadı (migration 160 yok) → bölüm çizilmez. */
  templates: TemplateRef[] | null
  draftTasks: AcademicTask[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [templateId, setTemplateId] = useState(templates?.[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  if (templates === null) return null

  function apply() {
    startTransition(async () => {
      const r = await applyTemplateAction(studentId, templateId)
      if (r.error) toast.error(r.error)
      else toast.success(`${r.created ?? 0} görev taslak olarak eklendi; yayımlamadan önce düzenleyebilirsiniz.`)
      router.refresh()
    })
  }

  function save() {
    startTransition(async () => {
      const r = await saveTemplateAction({
        name,
        items: draftTasks.map(t => ({
          scopeId: t.scopeId,
          kind: t.kind,
          title: t.title,
          targetMinutes: t.targetMinutes,
          checklist: t.checklist.map(c => c.title),
        })),
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(`“${name.trim()}” şablonu kaydedildi.`)
      setSaving(false)
      setName('')
      router.refresh()
    })
  }

  function remove() {
    const t = templates?.find(x => x.id === templateId)
    if (!t || !window.confirm(`“${t.name}” şablonu silinecek. Öğrencilere verilmiş görevler etkilenmez.`)) return
    startTransition(async () => {
      const r = await deleteTemplateAction(templateId)
      if (r.error) toast.error(r.error)
      else toast.success('Şablon silindi.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-1.5 rounded-md border border-dashed p-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <LayoutTemplate className="size-3.5" />
        Ödev şablonları
      </p>
      {templates.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <NativeSelect
            aria-label="Şablon"
            value={templateId}
            onChange={e => setTemplateId(e.target.value)}
            className="min-w-0 flex-1 text-xs"
            disabled={isPending}
          >
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.count} görev)
              </option>
            ))}
          </NativeSelect>
          <Button size="sm" variant="outline" disabled={isPending || !templateId} onClick={apply}>
            {isPending ? <Loader2 className="animate-spin" /> : null}
            Uygula
          </Button>
          <Button size="sm" variant="ghost" disabled={isPending || !templateId} onClick={remove} aria-label="Şablonu sil">
            <Trash2 />
          </Button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Henüz şablon yok. Sepetteki görevleri şablon olarak kaydedin.</p>
      )}

      {saving ? (
        <div className="flex items-center gap-1.5">
          <Input
            aria-label="Şablon adı"
            placeholder="Ör. TYT haftalık rutin"
            maxLength={80}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (name.trim()) save()
              }
            }}
            className="h-8 text-xs"
          />
          <Button size="sm" disabled={isPending || !name.trim()} onClick={save}>
            Kaydet
          </Button>
        </div>
      ) : (
        <Button
          size="xs"
          variant="ghost"
          disabled={draftTasks.length === 0}
          onClick={() => setSaving(true)}
          title={draftTasks.length === 0 ? 'Sepette görev yok' : undefined}
        >
          <BookmarkPlus className="size-3.5" />
          Sepetteki {draftTasks.length} görevi şablon olarak kaydet
        </Button>
      )}
      <p className="text-[11px] text-muted-foreground">Şablon yalnız görevleri tutar; kitap çalışmaları her hafta haritadan seçilir.</p>
    </div>
  )
}
