'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClipboardPaste } from 'lucide-react'
import { parsePaste, type PasteCourse } from '@/lib/academic-paste'
import { TASK_KIND_LABEL } from '@/lib/academic-tasks'
import { createTasksBulkAction } from '@/app/(dashboard)/teacher/students/[studentId]/dersler/actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// TOPLU YAPIŞTIR (M1.0-03 §4) — API/LLM yok; lib/academic-paste'in
// deterministik ayrıştırıcısı. Önizleme canlı; hatalı satır işaretlenir,
// geçerli satırlar sepete gider.

const EXAMPLE = `11. Sınıf Fizik | Süre | 120 dk
11. Sınıf Kimya | Görev | Yazılı kapsamını tekrar et
AYT Geometri | Görev | Tüm formülleri çıkar | Tarihsiz`

export function BulkPasteDialog({
  studentId,
  courses,
  triggerLabel = 'Toplu Yapıştır',
}: {
  studentId: string
  /** Öğrencinin AKTİF Ders Havuzu — eşleşme yalnız bunlarla. */
  courses: PasteCourse[]
  triggerLabel?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [isPending, startTransition] = useTransition()
  const rows = useMemo(() => parsePaste(text, courses), [text, courses])
  const valid = rows.filter((r) => r.ok)

  function submit() {
    if (valid.length === 0) return
    startTransition(async () => {
      const r = await createTasksBulkAction(
        studentId,
        valid.map((x) => ({
          scopeId: x.scopeId,
          kind: x.kind,
          title: x.title,
          targetMinutes: x.targetMinutes,
          checklist: x.checklist,
          undated: x.undated,
        }))
      )
      if (r.error) {
        toast.error(r.error)
        router.refresh()
        return
      }
      toast.success(`${r.created} çalışma sepete eklendi.`)
      setText('')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ClipboardPaste className="size-4" />
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Toplu Yapıştır</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Her satır: <span className="font-medium">Ders | Tür | Metin</span>. Tür Görev, Checklist ya da Süre;
              sona <span className="font-medium">| Tarihsiz</span> eklenebilir.
            </p>
            <Textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={EXAMPLE}
              aria-label="Yapıştırılacak satırlar"
              className="font-mono text-xs"
            />
            {rows.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="px-3 py-1.5 text-left font-medium">Bulunan çalışma</th>
                      <th className="px-3 py-1.5 text-left font-medium">Yorum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.line} className="border-b last:border-0">
                        {r.ok ? (
                          <>
                            <td className="px-3 py-1.5">
                              {r.scopeName} — {r.kind === 'sure' ? `${r.targetMinutes} dk` : r.title}
                              {r.checklist.length > 0 && (
                                <span className="text-muted-foreground"> ({r.checklist.join(' / ')})</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {r.undated ? 'Tarihsiz görev' : TASK_KIND_LABEL[r.kind]}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-1.5 font-mono text-xs">{r.raw}</td>
                            <td className="px-3 py-1.5 text-destructive-foreground">{r.error}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button disabled={isPending || valid.length === 0} onClick={submit}>
              {valid.length} çalışmayı sepete ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
