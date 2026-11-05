'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Library, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { Section } from '@/components/shared/section'
import {
  listWorkspaceBooksAction,
  publishBooksToLibraryAction,
  type AdminWorkspaceBook,
  type PublishReport,
} from './actions'

// KOÇ HAVUZUNDAN KÜTÜPHANEYE YAYIN — EK-05 (154).
//
// Sude'nin kütüphaneden kitap ekleyebilmesi için kitapların önce kütüphanede
// yayında olması gerekiyor. Yönetici bir koçun havuzunu seçer, istediği
// kitapları işaretler ve gerekçeyle yayınlar. Koçun kitabı yerinde kalır;
// kütüphaneye AYRI bir kopya girer. Diğer koçlar oradan seçip ekler.

const MAX_SELECTION = 50

export function WorkspacePublish({
  workspaces,
  libraryReady,
}: {
  workspaces: { id: string; name: string; owner: string | null }[]
  libraryReady: boolean
}) {
  const router = useRouter()
  const [workspaceId, setWorkspaceId] = useState('')
  const [books, setBooks] = useState<AdminWorkspaceBook[] | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState('')
  const [report, setReport] = useState<PublishReport | null>(null)
  const [isPending, startTransition] = useTransition()

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    if (!books) return []
    return q
      ? books.filter(b =>
          [b.title, b.subject, b.publisher, b.level_exam].some(v => v?.toLocaleLowerCase('tr').includes(q))
        )
      : books
  }, [books, query])

  function load(id: string) {
    setWorkspaceId(id)
    setBooks(null)
    setSelected(new Set())
    setReport(null)
    if (!id) return
    startTransition(async () => {
      const r = await listWorkspaceBooksAction(id)
      if (r.error) {
        toast.error(r.error)
        return
      }
      setBooks(r.books ?? [])
    })
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size >= MAX_SELECTION) toast.error(`Tek seferde en fazla ${MAX_SELECTION} kitap.`)
      else next.add(id)
      return next
    })
  }

  function selectVisible() {
    const candidates = visible.filter(b => b.library_status !== 'approved').map(b => b.id)
    setSelected(new Set(candidates.slice(0, MAX_SELECTION)))
    if (candidates.length > MAX_SELECTION) {
      toast.info(`İlk ${MAX_SELECTION} kitap seçildi; kalanları sonraki seferde yayınlayın.`)
    }
  }

  function publish() {
    startTransition(async () => {
      const r = await publishBooksToLibraryAction([...selected], reason)
      if (r.error) {
        toast.error(r.error)
        return
      }
      setReport(r.report ?? null)
      setSelected(new Set())
      toast.success(`${r.report?.published ?? 0} kitap kütüphaneye yayınlandı.`)
      // Durum rozetleri ("Yayında") tazelensin.
      const fresh = await listWorkspaceBooksAction(workspaceId)
      if (!fresh.error) setBooks(fresh.books ?? [])
      router.refresh()
    })
  }

  if (!libraryReady) return null

  return (
    <Section
      title="Koç havuzundan yayınla"
      description="Bir koçun havuzundaki kitapları seçerek kütüphaneye yayınlayın. Koçun kitabı yerinde kalır; kütüphaneye ayrı bir kopya girer ve tüm koçlar oradan seçip ekleyebilir."
      variant="card"
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pub-ws" className="text-xs">Çalışma alanı</Label>
          <NativeSelect id="pub-ws" value={workspaceId} onChange={e => load(e.target.value)} className="min-w-64">
            <option value="">Seçin</option>
            {workspaces.map(w => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.owner ? ` · ${w.owner}` : ''}
              </option>
            ))}
          </NativeSelect>
        </div>

        {isPending && !books && workspaceId && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Kitaplar yükleniyor…
          </p>
        )}

        {books && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Input
                placeholder="Kitap, ders ya da yayınevi ara"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="max-w-xs"
              />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {books.length} kitap · {selected.size} seçili
                </span>
                <Button size="xs" variant="ghost" onClick={selectVisible} disabled={visible.length === 0}>
                  Görünenleri seç
                </Button>
                {selected.size > 0 && (
                  <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>
                    Seçimi temizle
                  </Button>
                )}
              </div>
            </div>

            <ul className="max-h-96 divide-y overflow-y-auto rounded-md border text-sm">
              {visible.length === 0 && <li className="px-3 py-4 text-muted-foreground">Kitap yok.</li>}
              {visible.map(b => {
                const published = b.library_status === 'approved'
                return (
                  <li key={b.id} className="flex items-start gap-2 px-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                      checked={selected.has(b.id)}
                      disabled={published || isPending}
                      onChange={() => toggle(b.id)}
                      aria-label={`${b.title} seç`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{b.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[b.subject, b.level_exam, b.publisher, b.edition_year].filter(Boolean).join(' · ')} ·{' '}
                        {b.section_count} bölüm · {b.test_count} birim
                      </p>
                    </div>
                    {published ? (
                      <Badge variant="success" className="shrink-0">Yayında</Badge>
                    ) : b.library_status === 'pending' ? (
                      <Badge variant="info" className="shrink-0">Öneri bekliyor</Badge>
                    ) : null}
                  </li>
                )
              })}
            </ul>

            <div className="space-y-1.5">
              <Label htmlFor="pub-reason" className="text-xs">Gerekçe (yönetim kaydına yazılır, en az 10 karakter)</Label>
              <Textarea
                id="pub-reason"
                rows={2}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Örn: Burak'ın onayıyla ortak kütüphaneye açıldı."
              />
            </div>

            <Button onClick={publish} disabled={isPending || selected.size === 0 || reason.trim().length < 10}>
              {isPending ? <Loader2 className="animate-spin" /> : <Library />}
              {selected.size} kitabı kütüphaneye yayınla
            </Button>
          </>
        )}

        {report && (
          <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-xs">
            <p className="font-medium">
              {report.published} yayınlandı · {report.skipped.length} atlandı · {report.failed.length} hata
            </p>
            {[...report.skipped, ...report.failed].map(r => (
              <p key={r.id} className="text-muted-foreground">
                {r.title ?? r.id}: {r.reason}
              </p>
            ))}
          </div>
        )}
      </div>
    </Section>
  )
}
