'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MoreHorizontal, Users } from 'lucide-react'
import { STATUS_LABEL, type NoticeKind, type StudentStatus } from '@/lib/student-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTable, type Column } from '@/components/shared/data-table'
import { SearchInput } from '@/components/shared/search-input'
import { SegmentedField } from '@/components/shared/segmented-field'
import { cn } from '@/lib/utils'

/**
 * Dashboard öğrenci tablosu (R7-01 §5).
 *
 * NEDEN İSTEMCİ BİLEŞENİ: hedef ekranda tablonun üstünde arama kutusu ve
 * durum filtresi var. Süzme sunucuya taşınsaydı her harfte bir gidiş
 * dönüş olurdu; liste zaten tamamı indirilmiş ve en fazla birkaç yüz
 * satır (finance-table.tsx ile aynı gerekçe).
 *
 * HESAP BURADA DEĞİL: durum eşikleri, saat farkları ve bildirim sinyali
 * SUNUCUDA hesaplanıp hazır satır olarak geliyor. `computeStudentStatus`
 * istemciye taşınsaydı aynı eşikler iki yerde yaşar ve istemcinin saati
 * kaymış bir kullanıcıda tablo başkasının gördüğünden farklı okunurdu.
 */

export interface DashboardRow {
  id: string
  name: string
  /** "12. Sınıf · AYT" — sunucuda birleştirildi. */
  meta: string | null

  weeklyTotal: number
  weeklySubmitted: number
  weeklyPercent: number

  approvalPending: number

  noticeLabel: string
  noticeKind: NoticeKind

  /** Sunucuda biçimlendirilmiş: "Bugün 20:00" / "Cuma 18:00". */
  contactLabel: string | null
  /** "5 saat kaldı" — contactLabel ile birlikte anlamlı. */
  contactLeft: string | null
  contactKindLabel: string | null
  contactIsToday: boolean

  status: StudentStatus
}

/** Durum etiketinin rozet varyantı — renk YALNIZ sinyal verir (§8). */
const STATUS_VARIANT: Record<StudentStatus, 'success' | 'warning' | 'destructive' | 'neutral'> = {
  yolunda: 'success',
  takip_et: 'warning',
  geride: 'warning',
  mudahale: 'destructive',
}

/**
 * Teslim oranının rengi DURUMDAN gelir, kendi eşiğinden değil.
 *
 * Oran için ayrı bir eşik tablosu yazmak (örneğin "%50 altı kırmızı")
 * aynı satırda iki farklı "geride" tanımı yaratırdı: rozet yeşil,
 * oran kırmızı. Renk kaynağı tek olmalı.
 */
const SUBMISSION_TONE: Record<StudentStatus, string> = {
  yolunda: 'text-success-foreground',
  takip_et: 'text-warning-foreground',
  geride: 'text-warning-foreground',
  mudahale: 'text-destructive-foreground',
}

type StatusFilter = 'hepsi' | 'dikkat' | 'yolunda'

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'hepsi', label: 'Hepsi' },
  { value: 'dikkat', label: 'Dikkat' },
  { value: 'yolunda', label: 'Yolunda' },
]

/**
 * Satır menüsü — YALNIZ GEZİNME.
 *
 * Buradan hiçbir şey yazılmıyor. Dashboard "sıradaki müdahaleyi
 * belirleyen operasyon ekranı"; tek tıkla durum değiştiren bir menü,
 * öğretmenin öğrenciyi açmadan karar vermesini teşvik ederdi.
 */
function RowMenu({ studentId, studentName }: { studentId: string; studentName: string }) {
  const base = `/teacher/students/${studentId}`
  const links = [
    { href: `${base}/homework/new`, label: 'Ödev Ver' },
    { href: `${base}/haftalik-akis`, label: 'Haftalık Akış' },
    { href: `${base}/gorusmeler`, label: 'Görüşmeler' },
    { href: `${base}/report`, label: 'Rapor' },
  ]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${studentName} işlemleri`}
            // SATIRIN TAMAMI ZATEN BİR BAĞLANTI (DataTable rowHref).
            // Tıklama yayılmazsa menü açılırken öğrenci detayına da
            // gidilirdi.
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {links.map((link) => (
          <DropdownMenuItem key={link.href} render={<Link href={link.href} />}>
            {link.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function StudentsTable({ rows }: { rows: DashboardRow[] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('hepsi')

  const visible = useMemo(() => {
    // Türkçe arama: "İ"/"ı" çiftleri yüzünden `toLowerCase()` tek başına
    // yanlış eşleşir ("İzel".toLowerCase() → "i̇zel"). Locale'li sürüm
    // kullanılıyor.
    const q = query.trim().toLocaleLowerCase('tr')
    return rows.filter((row) => {
      if (q !== '' && !row.name.toLocaleLowerCase('tr').includes(q)) return false
      if (filter === 'yolunda') return row.status === 'yolunda'
      if (filter === 'dikkat') return row.status !== 'yolunda'
      return true
    })
  }, [rows, query, filter])

  const columns: Column<DashboardRow>[] = [
    {
      key: 'student',
      header: 'Öğrenci',
      render: (s) => (
        <div>
          <p className="font-medium">{s.name}</p>
          {s.meta && <p className="mt-0.5 text-xs text-muted-foreground">{s.meta}</p>}
        </div>
      ),
    },
    {
      key: 'submitted',
      header: 'Teslim',
      align: 'center',
      render: (s) =>
        s.weeklyTotal === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={cn('tabular-nums', SUBMISSION_TONE[s.status])}>
            {s.weeklySubmitted}
            <span className="opacity-70">/{s.weeklyTotal}</span>
            <span className="ml-1.5 text-xs opacity-70">%{s.weeklyPercent}</span>
          </span>
        ),
    },
    {
      key: 'approval',
      header: 'Onay',
      align: 'center',
      hideBelow: 'sm',
      render: (s) =>
        s.approvalPending > 0 ? (
          <span className="font-medium tabular-nums">{s.approvalPending}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'notice',
      header: 'Bildirim / Not',
      hideBelow: 'md',
      render: (s) => (
        // NOT İÇERİĞİ BURAYA HİÇ GELMİYOR — sunucu yalnız sinyal
        // gönderiyor (§8, ekran paylaşımı gerekçesi).
        <span
          className={cn(
            'text-sm',
            s.noticeKind === 'check_in_late' && 'font-medium text-warning-foreground',
            s.noticeKind === 'none' && 'text-muted-foreground'
          )}
        >
          {s.noticeKind === 'check_in_done' && '✓ '}
          {s.noticeLabel}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Sonraki Temas',
      render: (s) =>
        s.contactLabel === null ? (
          <span className="text-sm text-muted-foreground">Planlanmadı</span>
        ) : (
          <div className="text-sm">
            <p className={cn(s.contactIsToday && 'font-medium')}>
              {/* BUGÜN yalnız küçük bir etiketle vurgulanır; satır yoğun
                  renge boyanmaz (§6, §10.7). */}
              {s.contactIsToday && (
                <span className="mr-1.5 rounded border border-warning-border bg-warning-subtle px-1 py-0.5 text-[10px] font-medium tracking-wide text-warning-foreground">
                  BUGÜN
                </span>
              )}
              {s.contactLabel}
            </p>
            <p className="text-xs text-muted-foreground">
              {s.contactKindLabel}
              {s.contactLeft && ` · ${s.contactLeft}`}
            </p>
          </div>
        ),
    },
    {
      key: 'status',
      header: 'Durum',
      align: 'right',
      render: (s) => <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>,
    },
    {
      key: 'menu',
      header: <span className="sr-only">İşlemler</span>,
      align: 'right',
      className: 'w-10',
      render: (s) => <RowMenu studentId={s.id} studentName={s.name} />,
    },
  ]

  const filtering = query.trim() !== '' || filter !== 'hepsi'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Öğrenci ara…"
          ariaLabel="Öğrenci ara"
          className="w-full sm:w-64"
        />
        <SegmentedField
          label="Durum"
          options={FILTER_OPTIONS}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {/* SÜZÜLMÜŞ LİSTE KAÇ SATIR GÖSTERİYOR, SÖYLENİR. Aksi hâlde
          filtre açık unutulduğunda öğretmen eksik listeyi tam liste
          sanardı. */}
      {filtering && (
        <p className="text-xs text-muted-foreground">
          {rows.length} öğrenciden {visible.length} tanesi gösteriliyor.
        </p>
      )}

      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(s) => s.id}
        rowHref={(s) => `/teacher/students/${s.id}`}
        rowLabel={(s) => `${s.name} detayına git`}
        empty={
          filtering
            ? {
                icon: Users,
                title: 'Aramaya uyan öğrenci yok',
                description: 'Farklı bir ad deneyin ya da durum filtresini kaldırın.',
              }
            : {
                icon: Users,
                title: 'Henüz öğrenci yok',
                description: 'İlk öğrencini ekleyerek takip etmeye başla.',
                action: { label: 'Öğrenci Ekle', href: '/teacher/students/new' },
              }
        }
      />
    </div>
  )
}
