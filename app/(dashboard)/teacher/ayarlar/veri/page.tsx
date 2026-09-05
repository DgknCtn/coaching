import type { Metadata } from 'next'
import { Lock } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { EmptyState } from '@/components/shared/empty-state'
import { getTeacherContext } from '@/lib/workspace'
import { DeletionPanel } from './deletion-panel'

export const metadata: Metadata = { title: 'Hesap ve veri' }
export const dynamic = 'force-dynamic'

// HESAP VE VERİ (068).
//
// ============================================================
// NEDEN VAR
//
// 053 silme talebi altyapısını kurmuştu — deletion_requests tablosu,
// request_data_deletion ve cancel_data_deletion RPC'leri, 30 günlük
// bekleme penceresi. Ama hiçbiri arayüze bağlanmamıştı: kullanıcı KVKK
// kapsamındaki silme hakkını üründen kullanamıyordu, gizlilik metni ise
// silmeyi taahhüt ediyordu (denetim raporu bulgusu 8).
//
// SİLME OTOMATİK DEĞİL ve sayfa bunu AÇIKÇA söylüyor: talep bekleme
// penceresi dolduktan sonra elle yürütülüyor. Yapılmayan bir otomasyonu
// varmış gibi anlatmak, bugünkü durumdan daha kötü olurdu — kullanıcı
// verisinin silindiğini sanırdı.
// ============================================================

export default async function DataSettingsPage() {
  const { supabase, workspaceId, workspace, role } = await getTeacherContext()

  // SAHİBE ÖZEL: çalışma alanının tamamını silmek, aynı alanda ders
  // veren başka bir öğretmenin alabileceği bir karar değil. Kontrol
  // burada YALNIZ düzgün bir açıklama için; asıl savunma
  // request_data_deletion'ın içinde (053).
  if (role !== 'owner') {
    return (
      <div className="max-w-4xl space-y-8 p-6 md:p-8">
        <PageHeader title="Hesap ve veri" subtitle="Veri silme talebi" />
        <Section variant="card">
          <EmptyState
            icon={Lock}
            title="Bu ekran çalışma alanı sahibine özel"
            description="Çalışma alanının tamamını silme talebi yalnız sahibi tarafından açılabilir."
          />
        </Section>
      </div>
    )
  }

  const { data: pendingRequest } = await supabase
    .from('deletion_requests')
    .select('id, execute_after, requested_by_name')
    .eq('workspace_id', workspaceId)
    .eq('scope', 'workspace')
    .eq('status', 'pending')
    .maybeSingle()

  return (
    <div className="max-w-4xl space-y-8 p-6 md:p-8">
      <PageHeader
        title="Hesap ve veri"
        subtitle="Verilerinizin nasıl saklandığı ve silinmesini nasıl talep edeceğiniz"
      />

      <Section
        title="Nasıl işliyor"
        description="Talep açtığınızda ne olacağını önceden bilin."
        variant="card"
        contentClassName="p-4"
      >
        <ol className="space-y-2 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">1.</strong> Talebinizi açarsınız.
            Bu anda hiçbir veri silinmez.
          </li>
          <li>
            <strong className="text-foreground">2.</strong> 30 günlük bekleme
            penceresi başlar. Bu süre, yanlışlıkla ya da yetkisiz açılmış bir
            talebin geri alınabilmesi için var — talebi istediğiniz an iptal
            edebilirsiniz.
          </li>
          <li>
            <strong className="text-foreground">3.</strong> Pencere dolduktan
            sonra silme yürütülür. Bu adım şu an{' '}
            <strong className="text-foreground">elle</strong> yapılıyor;
            tamamlandığında size bildirilir.
          </li>
        </ol>

        <p className="mt-4 text-xs text-muted-foreground">
          Denetim kayıtları, hukuki yükümlülükler nedeniyle kişisel veri
          içermeyecek şekilde anonimleştirilerek saklanabilir. Ayrıntı için{' '}
          <Link href="/gizlilik" className="underline underline-offset-4">
            Gizlilik Politikası
          </Link>
          .
        </p>
      </Section>

      <Section
        title="Çalışma alanını sil"
        description="Öğrenciler, ödevler, kitap atamaları, destek yazışmaları ve finans kayıtları dahil."
      >
        <DeletionPanel
          workspaceName={workspace.name}
          pending={
            pendingRequest
              ? {
                  id: pendingRequest.id as string,
                  executeAfter: pendingRequest.execute_after as string,
                  requestedByName:
                    (pendingRequest.requested_by_name as string | null) ?? null,
                }
              : null
          }
        />
      </Section>
    </div>
  )
}
