import type { Metadata } from 'next'
import { Handshake, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { StatCard } from '@/components/shared/stat-card'
import { DataTable, type Column } from '@/components/shared/data-table'
import { createClient } from '@/lib/supabase/server'
import { formatKurus } from '@/lib/billing/pricing'
import { MarkPaidButton } from './mark-paid-button'

export const metadata: Metadata = { title: 'Partnerler' }
export const dynamic = 'force-dynamic'

// PARTNER YÖNETİMİ.
//
// Partner kodları BURADAN OLUŞTURULMUYOR: yeni partner eklemek bir
// anlaşma sonucu ve nadir bir işlem. Arayüzden eklenebilseydi, yanlışlıkla
// oluşturulan bir kod komisyon yükümlülüğü doğururdu. Kod veritabanından
// elle eklenir:
//
//   INSERT INTO public.partners (code, name, email)
//   VALUES ('ORNEK1', 'Ad Soyad', 'eposta@ornek.com');

interface PartnerRow {
  partner_id: string
  code: string
  name: string
  email: string | null
  commission_rate: number
  status: string
  referral_count: number
  paying_count: number
  total_kurus: number
  unpaid_kurus: number
}

export default async function AdminPartnersPage() {
  const supabase = await createClient()
  const { data } = await supabase.rpc('admin_list_partners')
  const rows = (data ?? []) as unknown as PartnerRow[]

  const totalUnpaid = rows.reduce((sum, r) => sum + Number(r.unpaid_kurus ?? 0), 0)
  const owedTo = rows.filter((r) => Number(r.unpaid_kurus) > 0).length

  const columns: Column<PartnerRow>[] = [
    {
      key: 'partner',
      header: 'Partner',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            <code>{r.code}</code>
            {r.email && ` · ${r.email}`}
          </p>
        </div>
      ),
    },
    {
      key: 'rate',
      header: 'Oran',
      align: 'right',
      hideBelow: 'md',
      render: (r) => (
        <span className="tabular-nums">%{Math.round(Number(r.commission_rate) * 100)}</span>
      ),
    },
    {
      key: 'referrals',
      header: 'Getirdiği',
      align: 'right',
      hideBelow: 'sm',
      render: (r) => (
        <span className="tabular-nums">
          {r.paying_count}
          <span className="text-muted-foreground">/{r.referral_count}</span>
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Toplam hakediş',
      align: 'right',
      hideBelow: 'lg',
      render: (r) => (
        <span className="tabular-nums">{formatKurus(Number(r.total_kurus))}</span>
      ),
    },
    {
      // ÖDENMEMİŞ SÜTUNU EN SAĞDA VE VURGULU: bu ekranın tek eylemi
      // "kime ne kadar borçluyum" sorusuna dayanıyor.
      key: 'unpaid',
      header: 'Ödenmemiş',
      align: 'right',
      render: (r) =>
        Number(r.unpaid_kurus) > 0 ? (
          <span className="font-medium tabular-nums text-warning-foreground">
            {formatKurus(Number(r.unpaid_kurus))}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (r) =>
        r.status !== 'active' ? (
          <Badge variant="neutral">Askıda</Badge>
        ) : Number(r.unpaid_kurus) > 0 ? (
          <MarkPaidButton
            partnerId={r.partner_id}
            partnerName={r.name}
            amount={formatKurus(Number(r.unpaid_kurus))}
          />
        ) : null,
    },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Partnerler"
        subtitle="Atıf kodları, getirilen çalışma alanları ve hakediş takibi"
        className="mb-0"
      />

      {/* ÖDENECEK TUTAR EN ÜSTTE: önceden tablonun içinde, başlıkla satırlar
          arasına sıkışmış bir uyarı şerididir. Bu ekranın açılma sebebi
          neredeyse her zaman bu rakam. Sıfırken kart yine çizilir — "borç
          yok" da bir cevap ve kartın kaybolması onu belirsiz bırakırdı. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={Wallet}
          label="Ödenmemiş hakediş"
          value={formatKurus(totalUnpaid)}
          subValue={owedTo > 0 ? `· ${owedTo} partner` : undefined}
        />
        <StatCard icon={Handshake} label="Partner" value={rows.length} />
        <StatCard
          label="Ödeyen çalışma alanı"
          value={rows.reduce((s, r) => s + Number(r.paying_count ?? 0), 0)}
        />
      </div>

      <Section variant="card">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.partner_id}
          empty={{
            icon: Handshake,
            title: 'Henüz partner yok',
            description:
              'Partner kodları anlaşma sonrası veritabanından eklenir; bu ekrandan oluşturulmaz.',
          }}
        />
      </Section>

      <p className="text-xs text-muted-foreground">
        Hakediş, KDV hariç tutar üzerinden hesaplanır. &quot;Ödendi işaretle&quot; yalnız
        kaydı günceller; para transferi elle yapılır.
      </p>
    </div>
  )
}
