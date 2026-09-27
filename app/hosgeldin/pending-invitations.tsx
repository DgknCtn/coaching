'use client'

import { useTransition, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { acceptInvitationByIdAction } from './actions'

export interface PendingInvitation {
  invitation_id: string
  role: 'student' | 'parent'
  student_name: string | null
  workspace_name: string
  expires_at: string
}

const ROLE_LABEL: Record<PendingInvitation['role'], string> = {
  student: 'Öğrenci',
  parent: 'Veli',
}

export function PendingInvitationList({ invitations }: { invitations: PendingInvitation[] }) {
  return (
    <ul className="mb-6 space-y-2">
      {invitations.map((inv) => (
        <InvitationRow key={inv.invitation_id} invitation={inv} />
      ))}
    </ul>
  )
}

function InvitationRow({ invitation }: { invitation: PendingInvitation }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <li className="rounded-lg border border-primary/40 bg-primary/5 p-4">
      <p className="text-sm">
        <span className="font-semibold">{invitation.workspace_name}</span> seni{' '}
        {invitation.student_name && (
          <>
            <span className="font-medium">{invitation.student_name}</span> için{' '}
          </>
        )}
        <span className="font-medium">{ROLE_LABEL[invitation.role]}</span> olarak davet etti.
      </p>
      <Button
        className="mt-3 w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const res = await acceptInvitationByIdAction(invitation.invitation_id)
            if (res?.error) setError(res.error)
          })
        }
      >
        {pending && <Loader2 className="animate-spin" />}
        Daveti kabul et
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  )
}
