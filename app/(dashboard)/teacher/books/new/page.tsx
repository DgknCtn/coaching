import Link from 'next/link'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { BookForm } from './book-form'

export const dynamic = 'force-dynamic'

export default async function NewBookPage() {
  const { supabase, workspaceId, activeTerm } = await getTeacherContext()

  if (!activeTerm) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="flex items-center gap-2 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
          <AlertCircle className="size-5 shrink-0" />
          <div>
            <p className="font-medium text-sm">Aktif dönem yok</p>
            <p className="text-xs mt-0.5">
              Kitap eklemeden önce{' '}
              <Link href="/teacher/terms" className="underline">
                bir dönem oluşturup aktif edin
              </Link>.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const { data: terms } = await supabase
    .from('academic_terms')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .in('status', ['active', 'draft'])
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/teacher/books">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">Yeni Kitap</h1>
      </div>
      <BookForm terms={terms ?? []} defaultTermId={activeTerm.id} />
    </div>
  )
}
