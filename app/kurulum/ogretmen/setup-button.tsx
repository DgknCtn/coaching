'use client'

import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setupTeacherWorkspaceAction } from './actions'

export function SetupTeacherButton() {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      className="w-full"
      disabled={pending}
      onClick={() => startTransition(async () => void (await setupTeacherWorkspaceAction()))}
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {pending ? 'Kuruluyor…' : 'Koç olarak çalışma alanımı kur'}
    </Button>
  )
}
