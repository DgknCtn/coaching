'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { switchWorkspaceAction } from '@/app/(dashboard)/workspace-actions'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

// Çalışma alanı seçici (Faz 3).
//
// NEDEN VAR: şema bir profilin birden çok kuruma üye olmasına izin
// veriyordu ama arayüzde geçiş yolu yoktu. Dahası `accept_invitation`
// `default_workspace_id`'yi yalnız boşken yazdığı için, zaten bir kurumu
// olan öğretmen ikinci bir kuruma davet edildiğinde o kurumun verisini
// HİÇ göremiyor ve hata da almıyordu.
//
// TEK KURUMDA HİÇ ÇİZİLMEZ: seçenek sunmayan bir seçici, kullanıcıya
// olmayan bir karar varmış gibi gösterir. Bireysel öğretmenlerin ekranı
// bugünkü gibi kalır.

export interface WorkspaceOption {
  id: string
  name: string
}

export function WorkspaceSwitcher({
  workspaces,
  activeId,
  compact = false,
}: {
  workspaces: WorkspaceOption[]
  activeId: string
  /** Daraltılmış rail'de yalnız ikon gösterilir. */
  compact?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Tek çalışma alanı varsa seçim diye bir şey yok.
  if (workspaces.length < 2) return null

  const active = workspaces.find(w => w.id === activeId)

  function pick(id: string) {
    if (id === activeId) return
    startTransition(async () => {
      const result = await switchWorkspaceAction(id)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      // Sunucu bağlamı değişti; ekranın tamamı yenilenmeli.
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Çalışma alanını değiştir"
        disabled={isPending}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-sidebar-border px-2 py-1.5',
          'text-left text-xs text-sidebar-foreground transition-colors hover:bg-sidebar-accent',
          'disabled:opacity-60',
          compact && 'justify-center px-0'
        )}
      >
        {isPending ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <Building2 className="size-3.5 shrink-0" />
        )}
        {!compact && <span className="truncate">{active?.name ?? 'Çalışma alanı'}</span>}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Çalışma alanı</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map(workspace => (
          <DropdownMenuItem
            key={workspace.id}
            disabled={isPending}
            onClick={() => pick(workspace.id)}
          >
            <Check
              className={cn(
                'size-4 shrink-0',
                workspace.id === activeId ? 'opacity-100' : 'opacity-0'
              )}
            />
            <span className="truncate">{workspace.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
