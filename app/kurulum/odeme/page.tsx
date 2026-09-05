import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { LicenseStep } from './license-step'

export const metadata: Metadata = { title: 'Planınızı seçin' }

// Zaten lisansı olan kullanıcı buraya düşmemeli: kayıttan sonraki
// yönlendirme sabit olduğu için tarayıcı geri tuşu ya da yer imi bu
// sayfayı tekrar açabilir.

export default async function LicenseSetupPage() {
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: existing } = await supabase
    .from('workspace_licenses')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .maybeSingle()

  if (existing) redirect('/teacher/ayarlar/abonelik')

  return <LicenseStep />
}
