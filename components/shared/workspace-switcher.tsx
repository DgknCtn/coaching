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

export type PanelKind = 'teacher' | 'student' | 'parent'

export interface WorkspaceOption {
  id: string
  name: string
  /**
   * Seçenek hangi paneli açar (B18). Bir kişi bir alanda öğretmen, başka
   * birinde veli olabilir; seçici bunların hepsini gösterir.
   */
  panel?: PanelKind
}

const PANEL_LABEL: Record<PanelKind, string> = {
  teacher: 'Öğretmen',
  student: 'Öğrenci',
  parent: 'Veli',
}

export function WorkspaceSwitcher({
  workspaces,
  activeId,
  currentPanel = 'teacher',
  compact = false,
}: {
  workspaces: WorkspaceOption[]
  activeId: string
  /** Şu an açık olan panel. */
  currentPanel?: PanelKind
  /** Daraltılmış rail'de yalnız ikon gösterilir. */
  compact?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Tek seçenek varsa seçim diye bir şey yok.
  if (workspaces.length < 2) return null

  const panelOf = (w: WorkspaceOption) => w.panel ?? 'teacher'
  const isActive = (w: WorkspaceOption) => w.id === activeId && panelOf(w) === currentPanel
  const active = workspaces.find(isActive) ?? workspaces.find(w => w.id === activeId)
  // Rol etiketi yalnız birden fazla panel türü varsa yazılır: yalnız
  // öğretmen alanları olan koçun ekranı bugünkü gibi kalır.
  const mixed = new Set(workspaces.map(panelOf)).size > 1
  const label = (w: WorkspaceOption) => (mixed ? `${w.name} · ${PANEL_LABEL[panelOf(w)]}` : w.name)

  function pick(option: WorkspaceOption) {
    if (isActive(option)) return
    startTransition(async () => {
      const result = await switchWorkspaceAction(option.id, panelOf(option))
      if (result?.error) {
        toast.error(result.error)
        return
      }
      // Başka bir panele geçiliyorsa oraya gidilir; aynı panelse sunucu
      // bağlamı değişti, ekranın tamamı yenilenir.
      if (panelOf(option) !== currentPanel) router.push(`/${panelOf(option)}`)
      else router.refresh()
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
        {!compact && (
          <span className="truncate">{active ? label(active) : 'Çalışma alanı'}</span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Çalışma alanı</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map(workspace => (
          <DropdownMenuItem
            key={`${workspace.id}:${panelOf(workspace)}`}
            disabled={isPending}
            onClick={() => pick(workspace)}
          >
            <Check
              className={cn('size-4 shrink-0', isActive(workspace) ? 'opacity-100' : 'opacity-0')}
            />
            <span className="truncate">{label(workspace)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
