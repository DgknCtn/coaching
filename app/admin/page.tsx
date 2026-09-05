import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Building2,
  Clock,
  CreditCard,
  LifeBuoy,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/shared/data-table'
import { MetricTiles, type MetricTile } from '@/components/shared/metric-tiles'
import { createClient } from '@/lib/supabase/server'
import { formatKurusShort } from '@/lib/billing/pricing'
import { daysLeft, planLabel, workspaceStatusLabel } from '@/lib/plans'
import { formatDateTr, formatRelativeTr } from '@/lib/format'
import { auditActionLabel } from '@/lib/audit'

export const metadata: Metadata = { title: 'Yönetim' }
export const dynamic = 'force-dynamic'

// ÇALIŞMA ALANI LİSTESİ VE ÖZET.
//
// ============================================================
// ÖĞRENCİ VERİSİ YOK — YALNIZ SAYI
//
// Bu ekranda öğrenci ADI, ödevi ya da ilerlemesi görünmüyor; yalnız KAÇ
// öğrencisi olduğu. Öğrenci sayısı bir faturalama bilgisidir, öğrencinin
// kim olduğu değil — ve o veri reşit olmayan kişilere ait.
//
// Kısıt arayüzde değil `admin_list_workspaces` RPC'sinde: fonksiyon o
// alanları zaten döndürmüyor. Arayüzde saklamak, veriyi tarayıcıya
// göndermiş olmak demekti.
// ============================================================
//
// ============================================================
// "NE VAR" DEĞİL "NE OLUYOR"
//
// Panel önceden bir veritabanı sayımıydı: kaç kayıt var. Hangi müşterinin
// ürünü gerçekten kullandığı, kimin ödemesi yarıda kaldığı, hangi
// denemenin bitmek üzere olduğu görünmüyordu — yani paneli açan kişi
// "şimdi ne yapmalıyım" sorusunun cevabını alamıyordu. 062 ile gelen
// son aktivite, bekleyen ödeme ve plan süresi alanları bunun için var.
// ============================================================

interface WorkspaceRow {
  workspace_id: string
  workspace_name: string
  owner_name: string | null
  owner_email: string | null
  created_at: string
  plan: string
  status: string
  active_students: number
  student_limit: number | null
  trial_ends_at: string | null
  license_ends_at: string | null
  total_paid_kurus: number
  partner_code: string | null
  // 062:
  license_student_count: number | null
  license_months: number | null
  last_activity_at: string | null
  pending_order_kurus: number
}

interface ActivityRow {
  id: string
  workspace_id: string
  workspace_name: string
  action: string
  created_at: string
}

interface Overview {
  total_workspaces: number
  trial_workspaces: number
  licensed_workspaces: number
  total_students: number
  open_tickets: number
  revenue_kurus: number
  // 063 — filtreden etkilenmeyen özet sayıları:
  pending_kurus: number
  expiring_trials: number
  awaiting_payment: number
  at_student_limit: number
}

// Filtre seçenekleri. Değerler DB'deki enum'larla birebir; adres
// çubuğundan gelen bilinmeyen bir değer sorguya HİÇ geçmiyor.
const STATUS_OPTIONS = [
  { value: 'active', label: 'Aktif' },
  { value: 'suspended', label: 'Askıda' },
  { value: 'archived', label: 'Arşivlendi' },
]

const PLAN_OPTIONS = [
  { value: 'trial', label: 'Deneme' },
  { value: 'licensed', label: 'Plan aktif' },
  { value: 'institution', label: 'Kurumsal' },
]

const PARTNER_OPTIONS = [
  { value: 'with', label: 'Partnerli' },
  { value: 'without', label: 'Partnersiz' },
]

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    durum?: string
    plan?: string
    partner?: string
  }>
}) {
  const supabase = await createClient()
  const { q, durum, plan, partner } = await searchParams

  // FİLTRE SQL TARAFINDA: sayfa 200 kayıt çekiyor, filtreyi burada
  // uygulamak 200'den fazla çalışma alanı olduğu gün sessizce yanlış
  // sonuç verirdi. Bilinmeyen değer parametreye hiç geçmiyor —
  // adres çubuğuna elle yazılan bir şey sorguyu boşa düşürmesin.
  const statusFilter = STATUS_OPTIONS.some((o) => o.value === durum) ? durum : null
  const planFilter = PLAN_OPTIONS.some((o) => o.value === plan) ? plan : null
  const partnerFilter = PARTNER_OPTIONS.some((o) => o.value === partner) ? partner : null

  const [{ data: overviewRows }, { data: workspaceRows }, { data: activityRows }] =
    await Promise.all([
      supabase.rpc('admin_overview'),
      supabase.rpc('admin_list_workspaces', {
        p_search: q || null,
        p_limit: 200,
        p_status: statusFilter,
        p_plan: planFilter,
        p_partner: partnerFilter,
      }),
      supabase.rpc('admin_recent_activity', { p_limit: 20 }),
    ])

  const overview = ((overviewRows ?? []) as unknown as Overview[])[0]
  const rows = (workspaceRows ?? []) as unknown as WorkspaceRow[]
  const activity = (activityRows ?? []) as unknown as ActivityRow[]
  const filtered = !!(statusFilter || planFilter || partnerFilter || q)

  const trials = overview?.trial_workspaces ?? 0
  const licensed = overview?.licensed_workspaces ?? 0

  // DÖNÜŞÜM: payda sıfırken "%0" YAZMAZ. Hiç denemesi olmayan bir
  // sistemde "%0 dönüşüm" doğru değil, yanlış bir başarısızlık iddiası.
  const conversionBase = trials + licensed
  const conversion =
    conversionBase > 0 ? `%${Math.round((licensed / conversionBase) * 100)}` : '—'

  // ÖZET FİLTREDEN ETKİLENMEZ: bu sayılar "sistemde ne oluyor" sorusunu
  // yanıtlıyor, "listede ne var" sorusunu değil. Önceden satırlardan
  // toplanıyorlardı; filtre eklenince rakam listeyle birlikte değişirdi.
  const pendingKurus = overview?.pending_kurus ?? 0

  const tiles: MetricTile[] = [
    {
      label: 'Toplam Çalışma Alanı',
      value: overview?.total_workspaces ?? 0,
      icon: Building2,
    },
    { label: 'Aktif Deneme', value: trials, icon: Clock, tone: 'info' },
    { label: 'Aktif Plan', value: licensed, icon: CreditCard, tone: 'success' },
    { label: 'Aktif Öğrenci', value: overview?.total_students ?? 0, icon: Users },
    {
      label: 'Deneme → Plan',
      value: conversion,
      icon: TrendingUp,
      hint: conversionBase > 0 ? `${licensed} / ${conversionBase}` : 'Henüz veri yok',
    },
    {
      label: 'Açık Talep',
      value: overview?.open_tickets ?? 0,
      icon: LifeBuoy,
      tone: (overview?.open_tickets ?? 0) > 0 ? 'warning' : 'default',
      href: '/admin/talepler',
    },
    {
      label: 'Bekleyen Ödeme',
      value: formatKurusShort(pendingKurus),
      icon: Wallet,
      tone: pendingKurus > 0 ? 'warning' : 'default',
    },
    {
      label: 'Toplam Tahsilat',
      value: formatKurusShort(overview?.revenue_kurus ?? 0),
      icon: Wallet,
    },
  ]

  // DİKKAT GEREKTİRENLER: hepsi 063'teki özetten, yani FİLTREDEN
  // BAĞIMSIZ. Hiçbiri yoksa bölüm HİÇ ÇİZİLMEZ — "her şey yolunda"
  // kartı her gün görünen bir gürültüdür ve gerçekten bir şey olduğunda
  // fark edilmesini zorlaştırır.
  const attention: { tone: 'destructive' | 'warning'; text: string }[] = []
  if ((overview?.expiring_trials ?? 0) > 0) {
    attention.push({
      tone: 'destructive',
      text: `${overview.expiring_trials} denemenin bitmesine 3 gün ya da daha az kaldı`,
    })
  }
  if ((overview?.awaiting_payment ?? 0) > 0) {
    attention.push({
      tone: 'warning',
      text: `${overview.awaiting_payment} çalışma alanında tamamlanmamış ödeme var`,
    })
  }
  if ((overview?.open_tickets ?? 0) > 0) {
    attention.push({
      tone: 'warning',
      text: `${overview.open_tickets} açık destek talebi bekliyor`,
    })
  }
  if ((overview?.at_student_limit ?? 0) > 0) {
    attention.push({
      tone: 'warning',
      text: `${overview.at_student_limit} çalışma alanı öğrenci limitine ulaştı`,
    })
  }

  // Partner kolonu boşken tabloyu seyreltiyordu: hiçbir kayıtta partner
  // yoksa kolon hiç çizilmiyor.
  const hasPartner = rows.some((r) => r.partner_code)

  const columns: Column<WorkspaceRow>[] = [
    {
      key: 'workspace',
      header: 'Çalışma Alanı',
      render: (r) => <span className="font-medium">{r.workspace_name}</span>,
    },
    {
      key: 'owner',
      header: 'Sahip',
      hideBelow: 'md',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate">{r.owner_name ?? '—'}</p>
          {r.owner_email && (
            <p className="truncate text-xs text-muted-foreground">{r.owner_email}</p>
          )}
        </div>
      ),
    },
    {
      key: 'students',
      header: 'Öğrenci',
      align: 'right',
      render: (r) => (
        <span className="tabular-nums">
          {r.active_students}
          {r.student_limit != null && (
            <span className="text-muted-foreground"> / {r.student_limit}</span>
          )}
        </span>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      hideBelow: 'lg',
      render: (r) => {
        if (r.plan === 'trial') return <span className="text-muted-foreground">Deneme</span>
        if (r.license_student_count != null) {
          return (
            <span className="tabular-nums">
              {r.license_student_count} öğrenci
              {r.license_months != null && ` · ${r.license_months} ay`}
            </span>
          )
        }
        return <span className="text-muted-foreground">—</span>
      },
    },
    {
      key: 'status',
      header: 'Durum',
      render: (r) => {
        // Çalışma alanı askıya alınmış/arşivlenmişse plan bilgisi
        // ikincil: önce erişim durumu söylenmeli.
        if (r.status !== 'active') {
          return <Badge variant="destructive">{workspaceStatusLabel(r.status)}</Badge>
        }
        if (r.plan === 'trial') return <Badge variant="info">Deneme</Badge>
        if (r.plan === 'licensed') return <Badge variant="success">Plan aktif</Badge>
        return <Badge variant="neutral">{planLabel(r.plan)}</Badge>
      },
    },
    {
      key: 'ends',
      header: 'Bitiş',
      hideBelow: 'sm',
      render: (r) => {
        const endsAt = r.plan === 'trial' ? r.trial_ends_at : r.license_ends_at
        const left = daysLeft(endsAt)
        if (left === null) return <span className="text-muted-foreground">—</span>
        if (left <= 0) {
          return <span className="text-destructive-foreground">Doldu</span>
        }
        return (
          <div className="tabular-nums">
            <p>{formatDateTr(endsAt)}</p>
            <p
              className={
                left <= 3 ? 'text-xs text-warning-foreground' : 'text-xs text-muted-foreground'
              }
            >
              {left} gün
            </p>
          </div>
        )
      },
    },
    {
      key: 'activity',
      header: 'Son Aktivite',
      hideBelow: 'lg',
      render: (r) => (
        <span className="text-muted-foreground">{formatRelativeTr(r.last_activity_at)}</span>
      ),
    },
    {
      key: 'revenue',
      header: 'Tahsilat',
      align: 'right',
      render: (r) => (
        <div className="tabular-nums">
          <p>{r.total_paid_kurus > 0 ? formatKurusShort(r.total_paid_kurus) : '—'}</p>
          {r.pending_order_kurus > 0 && (
            <p className="text-xs text-warning-foreground">
              {formatKurusShort(r.pending_order_kurus)} bekliyor
            </p>
          )}
        </div>
      ),
    },
  ]

  if (hasPartner) {
    columns.push({
      key: 'partner',
      header: 'Partner',
      hideBelow: 'lg',
      render: (r) =>
        r.partner_code ? (
          <code className="text-xs">{r.partner_code}</code>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    })
  }

  return (
    <div className="space-y-8">
      <MetricTiles metrics={tiles} className="xl:grid-cols-4" />

      {attention.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dikkat gerektirenler</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {attention.map((a) => (
                <li key={a.text} className="flex items-start gap-2">
                  {/* Renk tek başına anlam taşımıyor: metin zaten neyin
                      olduğunu söylüyor. Nokta yalnız tarama hızı için. */}
                  <span
                    aria-hidden
                    className={
                      a.tone === 'destructive'
                        ? 'mt-1.5 size-2 shrink-0 rounded-full bg-destructive'
                        : 'mt-1.5 size-2 shrink-0 rounded-full bg-warning'
                    }
                  />
                  {a.text}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Çalışma Alanları</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Arama ve filtreler sunucu tarafında: tek GET formu,
              JavaScript gerektirmiyor ve adres çubuğunda paylaşılabilir
              bir sonuç bırakıyor. Seçim değişince form kendiliğinden
              gönderilmiyor — "Uygula" düğmesi, üç filtreyi tek istekte
              birleştirmeyi mümkün kılıyor. */}
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q ?? ''}
              placeholder="Çalışma alanı, ad ya da e-posta ara…"
              aria-label="Çalışma alanı ara"
              className="h-9 w-full max-w-xs rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />

            <FilterSelect
              name="durum"
              label="Durum"
              value={statusFilter}
              options={STATUS_OPTIONS}
            />
            <FilterSelect name="plan" label="Plan" value={planFilter} options={PLAN_OPTIONS} />
            <FilterSelect
              name="partner"
              label="Partner"
              value={partnerFilter}
              options={PARTNER_OPTIONS}
            />

            <button
              type="submit"
              className="h-9 rounded-md border border-input bg-card px-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              Uygula
            </button>

            {filtered && (
              <Link
                href="/admin"
                className="h-9 px-2 text-sm leading-9 text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Temizle
              </Link>
            )}
          </form>

          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.workspace_id}
            rowHref={(r) => `/admin/calisma-alanlari/${r.workspace_id}`}
            rowLabel={(r) => `${r.workspace_name} detayına git`}
            empty={{
              icon: Building2,
              title: 'Kayıt bulunamadı',
              description: q
                ? 'Aramanızla eşleşen bir çalışma alanı yok.'
                : 'Henüz çalışma alanı oluşturulmamış.',
            }}
          />
        </CardContent>
      </Card>

      {/* SON AKTİVİTELER: audit_events zaten yazılıyordu ama hiçbir
          yönetim ekranı okumuyordu. Akış yalnız çalışma alanı adını,
          eylemi ve zamanı gösterir — eylemin ayrıntısı (detail) hiç
          okunmuyor. */}
      {activity.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Son aktiviteler</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {activity.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <Link
                      href={`/admin/calisma-alanlari/${a.workspace_id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {a.workspace_name}
                    </Link>{' '}
                    <span className="text-muted-foreground">{auditActionLabel(a.action)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTr(a.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/** Filtre açılırı — üçü de aynı görünüyor, üç kez yazmaya gerek yok. */
function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string
  label: string
  value: string | null | undefined
  options: { value: string; label: string }[]
}) {
  return (
    <select
      name={name}
      defaultValue={value ?? ''}
      aria-label={`${label} filtresi`}
      className="h-9 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <option value="">{label}: tümü</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
