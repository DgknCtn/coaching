'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus, Tag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { TAG_COLORS, TAG_COLOR_LABEL, type StudentTag, type TagColor } from '@/lib/student-tags'
import { createAndAttachTagAction, setStudentTagAction } from '../tag-actions'

// ÖĞRENCİ ETİKETLERİ — başlık şeridi (PRD 10.2 · Faz 2b). Yalnız öğretmen
// görür; öğrenci ve veli panelinde yoktur. Etiket bir tanı değildir.

const BADGE_VARIANT: Record<TagColor, 'neutral' | 'info' | 'success' | 'warning' | 'destructive'> = {
  neutral: 'neutral',
  info: 'info',
  success: 'success',
  warning: 'warning',
  destructive: 'destructive',
}

export function StudentTagPicker({
  studentId,
  tags,
  selected,
}: {
  studentId: string
  tags: StudentTag[]
  selected: string[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<TagColor>('neutral')
  const boxRef = useRef<HTMLDivElement>(null)
  const chosen = new Set(selected)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle(tag: StudentTag) {
    startTransition(async () => {
      const r = await setStudentTagAction(studentId, tag.id, !chosen.has(tag.id))
      if (r.error) toast.error(r.error)
      router.refresh()
    })
  }

  function create() {
    const value = name.trim()
    if (!value) return
    startTransition(async () => {
      const r = await createAndAttachTagAction(studentId, value, color)
      if (r.error) {
        toast.error(r.error)
        return
      }
      setName('')
      router.refresh()
    })
  }

  return (
    <div ref={boxRef} className="relative flex flex-wrap items-center gap-1.5 print:hidden">
      {tags
        .filter(t => chosen.has(t.id))
        .map(t => (
          <Badge key={t.id} variant={BADGE_VARIANT[t.color]} className="text-[11px]">
            {t.name}
          </Badge>
        ))}
      <Button
        size="xs"
        variant="ghost"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(o => !o)}
        className="text-muted-foreground"
      >
        <Tag className="size-3" />
        {chosen.size === 0 ? 'Etiket ekle' : 'Etiketler'}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Öğrenci etiketleri"
          className="absolute top-full left-0 z-40 mt-1 w-72 space-y-3 rounded-lg border bg-popover p-3 text-sm shadow-lg"
        >
          {tags.length > 0 ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {tags.map(t => (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={chosen.has(t.id)}
                      disabled={isPending}
                      onChange={() => toggle(t)}
                    />
                    <Badge variant={BADGE_VARIANT[t.color]} className="text-[11px]">
                      {t.name}
                    </Badge>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Henüz etiket yok. İlk etiketi aşağıdan oluşturun.</p>
          )}

          <div className="space-y-2 border-t pt-3">
            <div className="flex gap-1.5">
              <Input
                aria-label="Yeni etiket adı"
                placeholder="Yeni etiket (ör. Tekrar ihtiyacı)"
                maxLength={40}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    create()
                  }
                }}
                className="h-8 text-xs"
              />
              <NativeSelect
                aria-label="Renk"
                value={color}
                onChange={e => setColor(e.target.value as TagColor)}
                className="h-8 w-24 text-xs"
              >
                {TAG_COLORS.map(c => (
                  <option key={c} value={c}>
                    {TAG_COLOR_LABEL[c]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button size="sm" className="w-full" disabled={isPending || !name.trim()} onClick={create}>
              {isPending ? <Loader2 className="animate-spin" /> : <Plus />}
              Oluştur ve ekle
            </Button>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Etiketler yalnız size görünür; öğrenci ve veli görmez. Sağlık ya da aile durumu gibi hassas
              bilgileri etiket olarak yazmayın.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
