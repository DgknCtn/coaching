import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { CardStep } from './card-step'

export const metadata: Metadata = { title: 'Denemenizi başlatın' }

// KART ADIMI SAYFASI.
//
// Zaten aboneliği olan kullanıcı buraya düşmemeli: kayıttan sonra
// yönlendirme sabit olduğu için tarayıcı geri tuşu ya da yer imi bu
// sayfayı tekrar açabilir ve kullanıcı ikinci bir kart girmeye çalışır.

const NOTICES: Record<string, string> = {
  basarisiz:
    'Abonelik kurulamadı. Kart bilgilerinizi kontrol edip tekrar deneyebilirsiniz; tahsilat yapılmadı.',
  belirsiz:
    'Aboneliğinizin sonucu doğrulanamadı. Birkaç dakika içinde panelinizi kontrol edin; sorun sürerse bize yazın.',
}

export default async function CardSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ kart?: string }>
}) {
  const { supabase, workspaceId } = await getTeacherContext()
  const params = await searchParams

  const { data: existing } = await supabase
    .from('billing_subscriptions')
    .select('id')
    .eq('workspace_id', workspaceId)
    .in('status', ['trialing', 'active', 'past_due'])
    .maybeSingle()

  if (existing) redirect('/teacher')

  return <CardStep notice={params.kart ? NOTICES[params.kart] : undefined} />
}
