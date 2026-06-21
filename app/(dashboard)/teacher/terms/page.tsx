import { getTeacherContext } from '@/lib/workspace'
import { TermsClient } from './terms-client'

export const dynamic = 'force-dynamic'

export default async function TermsPage() {
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: terms } = await supabase
    .from('academic_terms')
    .select('id, name, start_date, end_date, status, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">Eğitim Dönemleri</h1>
      <TermsClient terms={terms ?? []} />
    </div>
  )
}
