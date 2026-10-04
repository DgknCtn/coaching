'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Archive,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HomeworkBatchRow } from '@/components/shared/homework-batch-row'
import { BulkItemDrawer, type BulkDrawerItem } from '@/components/shared/bulk-item-drawer'
import type { HomeworkDetailBook } from '@/lib/homework-detail'
import { formatDueDateTime } from '@/lib/homework-load'
import { formatSelectedUnits } from '@/lib/book-map'
import { formatRelativeTime } from '@/lib/student-attention'
import {
  approveItemsAction,
  completeItemsManuallyAction,
  releaseFromActiveLoadAction,
  releaseItemsAction,
  restoreToActiveLoadAction,
} from './homework-actions'

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

/** Sağ işlem panelinin satırı (M1.0-01 §4). */
export interface PublishedItem {
  id: string
  /** pending | pending_approval | completed | cancelled */
  status: string
  bookTitle: string | null
  trackingMode: string | null
  sectionTitle: string | null
  unitTitle: string | null
  unitNumber: number | null
  submittedAt: string | null
}

export interface PublishedBatch {
  id: string
  title: string | null
  dueDate: string
  /** Son teslim anı (132); eski kayıtlarda null olabilir. */
  dueAt: string | null
  description: string | null
  completed: number
  total: number
  isOverdue: boolean
  detail: HomeworkDetailBook[]
  /** 'archived' ise ödev aktif yükten çıkarılmış. */
  status: string
  /** Aktif ödevden kalem bazlı çıkarılan çalışma sayısı. */
  releasedCount: number
  items: PublishedItem[]
}

const OPEN_STATUSES = new Set(['pending', 'pending_approval'])

function itemLabel(item: PublishedItem): string {
  if (item.unitNumber != null && item.trackingMode) {
    const label = formatSelectedUnits([item.unitNumber], item.trackingMode)
    if (label) return label
  }
  return item.unitTitle ?? 'Çalışma'
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

  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [panelBatch, setPanelBatch] = useState<PublishedBatch | null>(null)
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
            {/* TEKİL İŞLEM (M1.0-01 §4.1): "Aktif Yükten Çıkar" tek ana
                aksiyon olmaktan çıktı; "İşlemler" sağ paneli açar ve
                panelde onayla / tamamlandı işaretle / aktif yükten çıkar
                bulunur. Satırın kendisi detay aç/kapa taşıdığı için panel
                ayrı düğmeden açılır. */}
            <div className="mt-3 flex shrink-0 flex-col items-end gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => setPanelBatch(batch)}
                aria-haspopup="dialog"
              >
                İşlemler
                <ChevronDown />
              </Button>
              {batch.releasedCount > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {batch.releasedCount} çalışma aktif yükten çıkarıldı
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {panelBatch && (
        <BatchActionPanel
          studentId={studentId}
          batch={panelBatch}
          onClose={() => setPanelBatch(null)}
          onDone={() => {
            setPanelBatch(null)
            router.refresh()
          }}
        />
      )}

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
 * Yayınlanan ödevin sağ işlem paneli (M1.0-01 §4.2–4.3).
 *
 * Görevler'deki onay paneliyle AYNI bileşen (BulkItemDrawer): açık
 * çalışmaların hepsi seçili gelir, öğretmen istemediklerini çıkarır.
 * Her düğme yalnız kendisine UYGUN seçili çalışmaları sayar:
 *
 *   onayla              — onay bekleyen (öğrenci teslim etmiş)
 *   tamamlandı işaretle — bekleyen (öğrenci teslim etmemiş); kaynak
 *                         'teacher_manual', öğrenci teslimi uydurulmaz
 *   aktif yükten çıkar  — açık olan her çalışma; silinmez
 */
function BatchActionPanel({
  studentId,
  batch,
  onClose,
  onDone,
}: {
  studentId: string
  batch: PublishedBatch
  onClose: () => void
  onDone: () => void
}) {
  const open = batch.items.filter(i => OPEN_STATUSES.has(i.status))
  const statusById = new Map(open.map(i => [i.id, i.status]))
  const completedCount = batch.items.filter(i => i.status === 'completed').length

  const items: BulkDrawerItem[] = open.map(i => ({
    id: i.id,
    primary: [i.sectionTitle, itemLabel(i)].filter(Boolean).join(' · '),
    secondary: i.bookTitle,
    badge:
      i.status === 'pending_approval'
        ? { label: 'Teslim edildi', variant: 'info' }
        : { label: 'Bekliyor', variant: 'neutral' },
    meta: i.submittedAt ? formatRelativeTime(i.submittedAt) : null,
  }))

  return (
    <BulkItemDrawer
      key={batch.id}
      title={batch.title ?? 'Ödev'}
      description={`Son teslim: ${formatDueDateTime(batch.dueDate, batch.dueAt)}`}
      items={items}
      footnote={
        open.length === 0
          ? 'Bu ödevde açık çalışma kalmadı.'
          : completedCount > 0
            ? `${completedCount} çalışma zaten tamamlandı; listede gösterilmiyor.`
            : null
      }
      actions={[
        {
          key: 'approve',
          label: n => `${n} çalışmayı onayla`,
          icon: Check,
          eligible: id => statusById.get(id) === 'pending_approval',
          run: async ids => {
            const res = await approveItemsAction(studentId, ids)
            if (res.error) return { error: res.error }
            return { message: `${res.count ?? ids.length} çalışma onaylandı.` }
          },
        },
        {
          key: 'complete',
          label: n => `${n} çalışmayı tamamlandı işaretle`,
          icon: CheckCheck,
          variant: 'outline',
          eligible: id => statusById.get(id) === 'pending',
          run: async ids => {
            const res = await completeItemsManuallyAction(studentId, ids)
            if (res.error) return { error: res.error }
            return {
              message: `${res.count ?? ids.length} çalışma öğretmen tarafından tamamlandı olarak işaretlendi.`,
            }
          },
        },
        {
          key: 'release',
          label: n => `${n} çalışmayı aktif yükten çıkar`,
          icon: Archive,
          variant: 'outline',
          reasonLabel: 'Aktif yükten çıkarma nedeni',
          run: async (ids, reason) => {
            const res = await releaseItemsAction(studentId, ids, reason)
            if (res.error) return { error: res.error }
            return {
              message: `${res.count ?? ids.length} çalışma aktif yükten çıkarıldı; kayıtlar silinmedi.`,
            }
          },
        },
      ]}
      onClose={onClose}
      onDone={onDone}
    />
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
