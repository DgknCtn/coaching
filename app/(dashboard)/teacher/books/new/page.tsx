import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { BookForm } from './book-form'

export const dynamic = 'force-dynamic'

export default async function NewBookPage() {
  const { supabase, workspaceId, activeTerm } = await getTeacherContext()

  // R4 (021): kitap havuzu dönemden bağımsız kalıcı bir kütüphane.
  // Aktif dönem yokken de kitap eklenebilir; dönem yalnızca öğrenciye
  // atama anında gerekir.
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
      <BookForm terms={terms ?? []} defaultTermId={activeTerm?.id ?? ''} />
    </div>
  )
}
