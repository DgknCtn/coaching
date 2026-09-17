'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Archive, ChevronDown, ChevronRight, Loader2, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HomeworkBatchRow } from '@/components/shared/homework-batch-row'
import type { HomeworkDetailBook } from '@/lib/homework-detail'
import { releaseFromActiveLoadAction, restoreToActiveLoadAction } from './homework-actions'

// YAYINLANAN ÖDEVLER — R7-06.01.
//
// ============================================================
// NEDEN CLIENT BİLEŞENİ OLDU
//
// Liste page.tsx içinde satır içi ve tamamen sunucuda render ediliyordu;
// hiçbir işlemi yoktu. Belge iki yeni yetenek istiyor: *"Ödev kartında
// tekil işlem ve çoklu seçim/toplu işlem bulunmalı."* Seçim durumu
// istemcide yaşamak zorunda.
//
// SATIR GÖVDESİ DEĞİŞMEDİ: `HomeworkBatchRow` ve `buildHomeworkDetail`
// aynen kullanılıyor. Eklenen yalnız seçim kutusu, işlem düğmesi ve
// arşiv bloğu — ödevin nasıl göründüğü aynı kaldı.
//
// ============================================================
// "SİL" DEĞİL "AKTİF YÜKTEN ÇIKAR"
//
// Ad bilinçli: işlem hiçbir şey silmiyor. Belge: *"Geçmiş kayıt
// silinmemeli; tarihçede 'Aktif yükten çıkarıldı' durumuyla kalmalı."*
// Bu yüzden ekranda da bir yıkım işlemi gibi görünmüyor — kırmızı
// değil, nötr.

export interface PublishedBatch {
  id: string
  title: string | null
  dueDate: string
  description: string | null
  completed: number
  total: number
  isOverdue: boolean
  detail: HomeworkDetailBook[]
  /** 'archived' ise ödev aktif yükten çıkarılmış. */
  status: string
}

export function PublishedHomeworkList({
  studentId,
  batches,
  activeFlowId,
}: {
  studentId: string
  batches: PublishedBatch[]
  /**
   * Aktif Haftalık Akış — "Yeniden Aktifleştir" için ZORUNLU hedef.
   *
   * Yoksa düğme hiç gösterilmez: belge eski teslim tarihinin
   * diriltilmemesini, ödevin *"aktif/gelecek Haftalık Akış seçilerek
   * yeni akışın son teslimini miras"* almasını şart koşuyor. Hedef akış
   * olmadan miras alınacak bir tarih yok.
   */
  activeFlowId: string | null
}) {
  const active = batches.filter(b => b.status !== 'archived')
  const released = batches.filter(b => b.status === 'archived')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function release(ids: string[]) {
    startTransition(async () => {
      const res = await releaseFromActiveLoadAction(studentId, ids)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      setSelected(new Set())
      toast.success(
        ids.length === 1
          ? 'Ödev aktif yükten çıkarıldı.'
          : `${ids.length} ödev aktif yükten çıkarıldı.`
      )
    })
  }

  return (
    <div className="space-y-4">
      {/* TOPLU İŞLEM ŞERİDİ — yalnız seçim varken görünür. Boşken de
          durması, hiçbir şey yapamayacak bir düğmeyi sürekli ekranda
          tutmak olurdu. */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info-border bg-info-subtle px-4 py-3">
          <p className="text-sm font-medium">{selected.size} ödev seçili</p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Seçimi temizle
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => release([...selected])}
            >
              {isPending ? <Loader2 className="animate-spin" /> : <Archive />}
              Aktif Yükten Çıkar ({selected.size})
            </Button>
          </div>
        </div>
      )}

      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        {active.map(batch => (
          <li key={batch.id} className="flex items-start gap-3 px-3 py-1">
            <input
              type="checkbox"
              checked={selected.has(batch.id)}
              onChange={() => toggle(batch.id)}
              aria-label={`${batch.title ?? 'Ödev'} seç`}
              className="mt-5 size-4 shrink-0 accent-primary"
            />
            <div className="min-w-0 flex-1">
              <HomeworkBatchRow
                title={batch.title}
                dueDate={batch.dueDate}
                completed={batch.completed}
                total={batch.total}
                isOverdue={batch.isOverdue}
                detail={batch.detail}
                note={batch.description}
              />
            </div>
            {/* TEKİL İŞLEM: tek ödev için seçim kutusunu işaretleyip
                şeride gitmek gereksiz bir adım. */}
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => release([batch.id])}
              className="mt-3 shrink-0"
              title="Aktif Yükten Çıkar"
            >
              <Archive />
              <span className="sr-only sm:not-sr-only">Aktif Yükten Çıkar</span>
            </Button>
          </li>
        ))}
      </ul>

      {released.length > 0 && (
        <ReleasedBlock
          studentId={studentId}
          batches={released}
          activeFlowId={activeFlowId}
          isPending={isPending}
          startTransition={startTransition}
        />
      )}
    </div>
  )
}

/**
 * Aktif yükten çıkarılmış ödevler — GÖRÜNÜR ama ayrı ve kapalı.
 *
 * Belgenin iki şartı burada birleşiyor: kayıt kaybolmayacak
 * (raporlanabilirlik) ama aktif borç gibi de görünmeyecek. Blok bu
 * yüzden hem var hem varsayılan kapalı.
 */
function ReleasedBlock({
  studentId,
  batches,
  activeFlowId,
  isPending,
  startTransition,
}: {
  studentId: string
  batches: PublishedBatch[]
  activeFlowId: string | null
  isPending: boolean
  startTransition: (fn: () => void) => void
}) {
  const [open, setOpen] = useState(false)

  function restore(batchId: string) {
    if (!activeFlowId) return
    startTransition(async () => {
      const res = await restoreToActiveLoadAction(studentId, batchId, activeFlowId)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success('Ödev yeniden aktifleştirildi; son teslim aktif haftadan alındı.')
    })
  }

  return (
    <section className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <Archive className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 text-sm font-medium">
          Aktif yükten çıkarılanlar
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {batches.length} ödev
        </span>
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t">
          <ul className="divide-y">
            {batches.map(batch => (
              <li key={batch.id} className="flex items-start gap-3 px-3 py-1">
                <div className="min-w-0 flex-1">
                  <HomeworkBatchRow
                    title={batch.title}
                    dueDate={batch.dueDate}
                    completed={batch.completed}
                    total={batch.total}
                    // ARŞİVLENMİŞ ÖDEV "GECİKMİŞ" DEĞİLDİR: aktif
                    // borçtan çıkarmanın amacı tam olarak buydu. Eski
                    // tarih hâlâ görünüyor (tarihçe), ama kırmızı uyarı
                    // olarak değil.
                    isOverdue={false}
                    detail={batch.detail}
                    note={batch.description}
                  />
                  <div className="px-4 pb-3">
                    <Badge variant="neutral">Aktif yükten çıkarıldı</Badge>
                  </div>
                </div>
                {activeFlowId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => restore(batch.id)}
                    className="mt-3 shrink-0"
                    title="Yeniden Aktifleştir"
                  >
                    <RotateCcw />
                    <span className="sr-only sm:not-sr-only">Yeniden Aktifleştir</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {!activeFlowId && (
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">
              Yeniden aktifleştirmek için açık bir Haftalık Akış gerekir — ödev o
              akışın son teslimini miras alır, eski tarihi geri gelmez.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
