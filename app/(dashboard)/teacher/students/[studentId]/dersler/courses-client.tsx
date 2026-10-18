'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { addCoursesAction, setCourseActiveAction } from './actions'

/** "Ders ekle" — katalogdan toplu seçim + yeni ad (§2 "hızlı toplu seçim"). */
export function AddCoursesDialog({
  studentId,
  scopes,
  existing,
}: {
  studentId: string
  scopes: { id: string; name: string }[]
  existing: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [newNames, setNewNames] = useState('')
  const [filter, setFilter] = useState('')
  const [isPending, startTransition] = useTransition()
  const have = useMemo(() => new Set(existing), [existing])
  const candidates = scopes.filter(
    (s) => !have.has(s.id) && s.name.toLocaleLowerCase('tr').includes(filter.trim().toLocaleLowerCase('tr'))
  )

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function submit() {
    const names = newNames
      .split(/\r?\n|,/)
      .map((n) => n.trim())
      .filter(Boolean)
    startTransition(async () => {
      const r = await addCoursesAction({ studentId, scopeIds: [...picked], newNames: names })
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(`${r.added} ders eklendi.`)
      setPicked(new Set())
      setNewNames('')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Ders ekle
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ders ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {scopes.length > 0 && (
              <>
                <Input placeholder="Derslerde ara…" value={filter} onChange={(e) => setFilter(e.target.value)} />
                <div className="max-h-60 overflow-auto rounded-md border p-2">
                  {candidates.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">Eklenecek katalog dersi yok.</p>
                  ) : (
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {candidates.map((s) => (
                        <li key={s.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                            <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                            {s.name}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <label htmlFor="newCourses" className="text-sm font-medium">
                Yeni ders
              </label>
              <Input
                id="newCourses"
                placeholder="ör. 11. Sınıf Coğrafya, AYT Geometri"
                value={newNames}
                onChange={(e) => setNewNames(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Virgülle ayırarak birden fazla yazabilirsiniz.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button disabled={isPending || (picked.size === 0 && !newNames.trim())} onClick={submit}>
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Pasife al / yeniden aç — geçmiş silinmez. */
export function CourseActiveToggle({
  studentId,
  scopeId,
  active,
}: {
  studentId: string
  scopeId: string
  active: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <Button
      size="xs"
      variant="ghost"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const r = await setCourseActiveAction(studentId, scopeId, !active)
          if (r.error) {
            toast.error(r.error)
            return
          }
          toast.success(active ? 'Ders pasife alındı.' : 'Ders yeniden aktif.')
          router.refresh()
        })
      }
    >
      {active ? 'Pasife al' : 'Yeniden aç'}
    </Button>
  )
}
