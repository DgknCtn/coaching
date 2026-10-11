'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Copy, KeyRound, Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  convertMemberLoginAction,
  disableMemberLoginAction,
  issueParentLoginAction,
  issueStudentLoginAction,
  renewMemberLoginAction,
  type MemberLoginRow,
} from './student-login-actions'

type Issued = { username: string; pin: string; name: string }

export function StudentLoginControls({
  studentId,
  studentName,
  student,
  parents,
  requested,
}: {
  studentId: string
  studentName: string
  /** null: öğrencinin henüz hesabı yok. */
  student: MemberLoginRow | null
  parents: MemberLoginRow[]
  /** "PIN'imi unuttum" isteği açık olan hesaplar (143). */
  requested: string[]
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Öğrenci</h3>
        <MemberCodeCard
          studentId={studentId}
          name={studentName}
          row={student}
          requested={!!student && requested.includes(student.profile_id)}
          // Hesap yoksa yeni hesap açılır; e-posta/Google hesabı varsa
          // AYNI hesap kullanıcı adı + PIN'e çevrilir.
          onIssue={() => issueStudentLoginAction(studentId)}
          issueLabel="Kullanıcı adı + PIN ver"
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Veliler</h3>
        {parents.length === 0 && (
          <p className="text-sm text-muted-foreground">Bu öğrenciye bağlı veli yok.</p>
        )}
        {parents.map((p) => (
          <MemberCodeCard
            key={p.profile_id}
            studentId={studentId}
            name={p.full_name}
            row={p}
            requested={requested.includes(p.profile_id)}
            showName
            onIssue={() => convertMemberLoginAction(studentId, p.profile_id)}
            issueLabel="Kullanıcı adı + PIN ver"
          />
        ))}
        <NewParentForm studentId={studentId} />
      </div>
    </div>
  )
}

/** PIN YALNIZ OLUŞTURMA YANITINDA VAR: veritabanında hash duruyor, bir
 *  daha gösterilemez. Sayfa yenilenince kaybolması bilinçli. */
function IssuedBox({ issued }: { issued: Issued }) {
  const shareText =
    `Merhaba ${issued.name.split(' ')[0]}, İZ'e giriş bilgilerin:\n` +
    `Adres: ${typeof window !== 'undefined' ? window.location.origin : ''}/login\n` +
    `Kullanıcı adı: ${issued.username}\nPIN: ${issued.pin}\nPIN'ini kimseyle paylaşma.`

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText)
      toast.success('Giriş bilgileri kopyalandı.')
    } catch {
      toast.error('Kopyalanamadı; bilgileri elle iletin.')
    }
  }

  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
      <p>
        Kullanıcı adı: <span className="font-mono font-semibold">{issued.username}</span>
      </p>
      <p>
        PIN: <span className="font-mono text-lg font-semibold tracking-widest">{issued.pin}</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        PIN yalnız şimdi görünür. Kişiye iletin; unutursa yeni PIN üretin.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          <Copy className="size-3.5" /> Kopyala
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          render={
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          WhatsApp ile gönder
        </Button>
      </div>
    </div>
  )
}

type IssueResult = Awaited<ReturnType<typeof issueStudentLoginAction>>

function MemberCodeCard({
  studentId,
  name,
  row,
  onIssue,
  issueLabel,
  showName = false,
  requested = false,
}: {
  studentId: string
  name: string
  row: MemberLoginRow | null
  /** Kodu olmayan hesap için ilk oluşturma ya da çevirme. */
  onIssue?: () => Promise<IssueResult>
  issueLabel?: string
  showName?: boolean
  /** Hesap "PIN'imi unuttum" isteği bıraktı. */
  requested?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [issued, setIssued] = useState<Issued | null>(null)
  const hasCode = Boolean(row?.has_code)

  function issue() {
    startTransition(async () => {
      const res = hasCode
        ? await renewMemberLoginAction(studentId, row!.profile_id)
        : await onIssue!()
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setIssued({ username: res.username, pin: res.pin, name })
      toast.success(res.created ? 'Giriş oluşturuldu.' : 'Yeni PIN oluşturuldu; eskisi artık çalışmaz.')
    })
  }

  function disable() {
    if (!row) return
    startTransition(async () => {
      const res = await disableMemberLoginAction(studentId, row.profile_id)
      if ('error' in res && res.error) toast.error(res.error)
      else {
        setIssued(null)
        toast.success('Kullanıcı adı + PIN girişi kapatıldı.')
      }
    })
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      {hasCode && row && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <KeyRound className="size-4 text-muted-foreground" aria-hidden />
          {showName && <span className="font-medium">{name} ·</span>}
          Kullanıcı adı: <span className="font-mono font-medium">{row.username}</span>
          {!row.active && <Badge variant="neutral">Kapalı</Badge>}
          {row.active && row.locked && <Badge variant="warning">Geçici kilit (yanlış PIN)</Badge>}
          {row.active && !row.locked && <Badge variant="success">Açık</Badge>}
          {requested && <Badge variant="warning">Yeni PIN istiyor</Badge>}
        </p>
      )}

      {!hasCode && row && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Mail className="size-4 text-muted-foreground" aria-hidden />
          {showName && <span className="font-medium">{name} ·</span>}
          <span className="text-muted-foreground">
            E-posta ya da Google ile giriyor. Google girişi kalktı; kullanıcı adı + PIN verin.
          </span>
        </p>
      )}

      {issued && <IssuedBox issued={issued} />}

      {(hasCode || onIssue) && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={issue}>
            {pending && <Loader2 className="animate-spin" />}
            {hasCode ? 'Yeni PIN üret' : issueLabel}
          </Button>
          {hasCode && row?.active && (
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={disable}>
              Girişi kapat
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function NewParentForm({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()
  const [issued, setIssued] = useState<Issued | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await issueParentLoginAction(studentId, name)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setIssued({ username: res.username, pin: res.pin, name })
      setName('')
      setOpen(false)
      toast.success('Veli girişi oluşturuldu.')
    })
  }

  return (
    <div className="space-y-3">
      {issued && <IssuedBox issued={issued} />}
      {!open ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <KeyRound className="size-3.5" /> Veli için kullanıcı adı + PIN oluştur
        </Button>
      ) : (
        <form
          method="post"
          onSubmit={submit}
          noValidate
          className="space-y-3 rounded-lg border bg-card p-4"
        >
          <fieldset disabled={pending} className="space-y-3 disabled:opacity-70">
            <div className="space-y-2">
              <Label htmlFor={`parent-name-${studentId}`}>Velinin adı soyadı</Label>
              <Input
                id={`parent-name-${studentId}`}
                autoComplete="off"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={name.trim().length < 2}>
                {pending && <Loader2 className="animate-spin" />}
                Oluştur
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Vazgeç
              </Button>
            </div>
          </fieldset>
        </form>
      )}
    </div>
  )
}
