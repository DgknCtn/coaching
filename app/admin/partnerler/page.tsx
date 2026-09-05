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
import { NewPartnerDialog } from './new-partner-dialog'
import { PartnerCodeCell } from './partner-code-cell'
import { CommissionRateCell } from './commission-rate-cell'
import { PartnerStatusButton } from './partner-status-button'

export const metadata: Metadata = { title: 'Partnerler' }
export const dynamic = 'force-dynamic'

// PARTNER YÖNETİMİ.
//
// PARTNER EKLEME ARTIK ARAYÜZDEN (068).
//
// 059'dan bu yana tek yol elle INSERT'tü ve bu yorum onu tarif
// ediyordu: her anlaşmada veritabanına bağlanmak gerekiyordu — yavaş,
// hataya açık ve denetim izi bırakmıyordu.
//
// Yanlışlıkla oluşturulan bir kodun komisyon yükümlülüğü doğurması
// riski, kodu üretmeyi engelleyerek değil ASKIYA ALINABİLİR yaparak
// karşılanıyor: 'suspended' bir partner ne yeni atıf alır ne de
// hakediş üretir (settle_billing_order yalnız aktif partneri arıyor).
//
// KOMİSYON: varsayılan %10, KDV hariç matrah üzerinden, ödeme
// KESİNLEŞTİKTEN sonra üretilir (059 · settle_billing_order). Oran
// partner başına ve bu ekrandan değiştirilebilir; hakediş satırları o
// anki oranı kendi içinde sakladığı için değişiklik geçmişe işlemez.

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
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <PartnerCodeCell code={r.code} />
            {r.email && <span className="truncate">{r.email}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'rate',
      header: 'Oran',
      align: 'right',
      hideBelow: 'md',
      render: (r) => (
        <CommissionRateCell
          partnerId={r.partner_id}
          partnerName={r.name}
          rate={Number(r.commission_rate)}
        />
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
      render: (r) => (
        <span className="flex items-center justify-end gap-1.5">
          {r.status !== 'active' && <Badge variant="neutral">Askıda</Badge>}
          {/* ÖDEME ÖNCE: askıya alınmış bir partnerin birikmiş hakedişi
              yerinde duruyor ve hâlâ ödenmesi gerekiyor. */}
          {Number(r.unpaid_kurus) > 0 && (
            <MarkPaidButton
              partnerId={r.partner_id}
              partnerName={r.name}
              amount={formatKurus(Number(r.unpaid_kurus))}
            />
          )}
          <PartnerStatusButton
            partnerId={r.partner_id}
            partnerName={r.name}
            status={r.status}
          />
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Partnerler"
        subtitle="Atıf kodları, getirilen çalışma alanları ve hakediş takibi"
        action={<NewPartnerDialog />}
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
              '"Partner Ekle" ile bir kod oluşturun; partner o kodun bağlantısını paylaşarak müşteri getirir.',
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
