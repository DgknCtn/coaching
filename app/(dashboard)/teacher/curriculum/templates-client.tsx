'use client'

import { useState, useTransition } from 'react'
import { Loader2, Plus, Save, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { EmptyState } from '@/components/shared/empty-state'
import { LibraryBig } from 'lucide-react'
import { createScopeAction } from '../students/[studentId]/curriculum/actions'
import {
  createTemplateAction,
  deleteTemplateAction,
  setTemplateItemsAction,
  type TemplateItemInput,
} from './actions'
import { cn } from '@/lib/utils'

// Müfredat şablonları ekranı (R5.2).
//
// Şablon = scope başına sıralı konu listesi + her konunun kaç hafta
// süreceği. MUTLAK TARİH YOKTUR; tarihler öğrenciye atama anında
// hesaplanır.
//
// Konu yönetimi için ayrı ekran yok: satıra ad yazılır. Aynı scope'ta
// aynı ad ikinci kez yazılırsa yeni konu açılmaz, mevcut yeniden
// kullanılır (upsert_topic).

export interface ScopeRow {
  id: string
  name: string
  subject: string | null
  levelExam: string | null
}

export interface TemplateRow {
  id: string
  name: string
  scopeId: string
  items: TemplateItemInput[]
}

interface Props {
  scopes: ScopeRow[]
  templates: TemplateRow[]
}

export function CurriculumTemplatesClient({ scopes, templates }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [scopeName, setScopeName] = useState('')
  const [newTemplateScope, setNewTemplateScope] = useState(scopes[0]?.id ?? '')
  const [newTemplateName, setNewTemplateName] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  function addScope() {
    const name = scopeName.trim()
    if (!name) return
    startTransition(async () => {
      const result = await createScopeAction(name)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setScopeName('')
      toast.success('Ders/kapsam eklendi.')
      router.refresh()
    })
  }

  function addTemplate() {
    const name = newTemplateName.trim()
    if (!name || !newTemplateScope) return
    startTransition(async () => {
      const result = await createTemplateAction(newTemplateScope, name)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setNewTemplateName('')
      toast.success('Şablon oluşturuldu.')
      if (result.templateId) setOpenId(result.templateId)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">Ders / Kapsam</h2>
        <p className="text-xs text-muted-foreground">
          &quot;TYT Matematik&quot;, &quot;AYT Fizik&quot;, &quot;10. Sınıf Kimya&quot; gibi.
          Her şablon ve her öğrenci akışı bir kapsama bağlıdır.
        </p>

        {scopes.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {scopes.map(s => (
              <li
                key={s.id}
                className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
              >
                {s.name}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2 pt-1">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="scopeName" className="text-xs">
              Yeni kapsam adı
            </Label>
            <Input
              id="scopeName"
              placeholder="Örn: TYT Matematik"
              value={scopeName}
              onChange={e => setScopeName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addScope()
                }
              }}
            />
          </div>
          <Button variant="outline" onClick={addScope} disabled={isPending || !scopeName.trim()}>
            <Plus className="size-4" />
            Ekle
          </Button>
        </div>
      </section>

      {scopes.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={LibraryBig}
            title="Önce bir ders/kapsam ekleyin"
            description="Şablonlar kapsam başına tanımlanır."
          />
        </div>
      ) : (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-4">
            <div className="space-y-1.5">
              <Label htmlFor="templateScope" className="text-xs">
                Kapsam
              </Label>
              <NativeSelect
                id="templateScope"
                value={newTemplateScope}
                onChange={e => setNewTemplateScope(e.target.value)}
                className="min-w-48"
              >
                {scopes.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="templateName" className="text-xs">
                Yeni şablon adı
              </Label>
              <Input
                id="templateName"
                placeholder="Örn: TYT Matematik 2026"
                value={newTemplateName}
                onChange={e => setNewTemplateName(e.target.value)}
              />
            </div>
            <Button onClick={addTemplate} disabled={isPending || !newTemplateName.trim()}>
              <Plus className="size-4" />
              Şablon oluştur
            </Button>
          </div>

          {templates.length === 0 ? (
            <div className="rounded-lg border bg-card">
              <EmptyState
                icon={LibraryBig}
                title="Henüz şablon yok"
                description="Şablon zorunlu değildir; öğrencinin akışını sıfırdan da kurabilirsiniz. Şablon yalnız tekrar eden kurulumu hızlandırır."
              />
            </div>
          ) : (
            <ul className="space-y-2">
              {templates.map(template => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  scopeName={scopes.find(s => s.id === template.scopeId)?.name ?? '—'}
                  open={openId === template.id}
                  onToggle={() => setOpenId(openId === template.id ? null : template.id)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function TemplateCard({
  template,
  scopeName,
  open,
  onToggle,
}: {
  template: TemplateRow
  scopeName: string
  open: boolean
  onToggle: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState<TemplateItemInput[]>(template.items)
  const [dirty, setDirty] = useState(false)
  const [newName, setNewName] = useState('')

  const totalWeeks = items.reduce((n, i) => n + i.duration_weeks, 0)

  function update(next: TemplateItemInput[]) {
    setItems(next)
    setDirty(true)
  }

  function save() {
    startTransition(async () => {
      const result = await setTemplateItemsAction(template.id, items)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setDirty(false)
      toast.success('Şablon kaydedildi.')
      router.refresh()
    })
  }

  function remove() {
    if (
      !window.confirm(
        `"${template.name}" silinecek. Bu şablondan kurulmuş öğrenci akışları ETKİLENMEZ. Devam edilsin mi?`
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await deleteTemplateAction(template.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Şablon silindi.')
      router.refresh()
    })
  }

  return (
    <li className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm font-medium">{template.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {scopeName} · {items.length} konu · {totalWeeks} hafta
          </span>
        </button>

        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-warning-foreground">Kaydedilmedi</span>}
          <Button size="xs" variant="ghost" onClick={remove} disabled={isPending}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t bg-muted/20 px-4 py-3">
          {items.length > 0 && (
            <ul className="space-y-1.5">
              {items.map((item, index) => (
                <li key={index} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <Input
                    value={item.name}
                    onChange={e =>
                      update(
                        items.map((it, i) => (i === index ? { ...it, name: e.target.value } : it))
                      )
                    }
                    className="h-8 flex-1"
                  />
                  <input
                    type="number"
                    min={1}
                    max={104}
                    value={item.duration_weeks}
                    onChange={e =>
                      update(
                        items.map((it, i) =>
                          i === index
                            ? { ...it, duration_weeks: Math.max(1, Number(e.target.value) || 1) }
                            : it
                        )
                      )
                    }
                    className="h-8 w-16 rounded-md border border-input bg-card px-2 text-xs tabular-nums outline-none focus-visible:border-ring"
                  />
                  <span className="text-xs text-muted-foreground">hf</span>
                  <button
                    type="button"
                    title="Konuyu çıkar"
                    onClick={() => update(items.filter((_, i) => i !== index))}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-end gap-2">
            <Input
              placeholder="Konu ekle — örn: Fonksiyonlar"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const name = newName.trim()
                  if (!name) return
                  update([...items, { name, duration_weeks: 1, note: null }])
                  setNewName('')
                }
              }}
              className="h-8 flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const name = newName.trim()
                if (!name) return
                update([...items, { name, duration_weeks: 1, note: null }])
                setNewName('')
              }}
              disabled={!newName.trim()}
            >
              <Plus className="size-3.5" />
              Ekle
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2 border-t pt-2">
            <p className="text-[11px] text-muted-foreground">
              Şablonda tarih yoktur; yalnız sıra ve süre. Tarihler öğrenciye atarken hesaplanır.
            </p>
            <Button size="sm" onClick={save} disabled={isPending || !dirty}>
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Kaydet
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
