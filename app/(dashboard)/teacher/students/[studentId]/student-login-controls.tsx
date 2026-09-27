'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Copy, KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { disableStudentLoginAction, issueStudentLoginAction } from './student-login-actions'

export function StudentLoginControls({
  studentId,
  studentName,
  info,
}: {
  studentId: string
  studentName: string
  info: { username: string; active: boolean; locked: boolean } | null
}) {
  const [pending, startTransition] = useTransition()
  // PIN YALNIZ BU YANITTA VAR: veritabanında hash duruyor, bir daha
  // gösterilemez. Sayfa yenilenince kaybolması bilinçli.
  const [issued, setIssued] = useState<{ username: string; pin: string } | null>(null)

  function issue() {
    startTransition(async () => {
      const res = await issueStudentLoginAction(studentId)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setIssued({ username: res.username, pin: res.pin })
      toast.success(res.created ? 'Giriş oluşturuldu.' : 'Yeni PIN oluşturuldu; eskisi artık çalışmaz.')
    })
  }

  function disable() {
    startTransition(async () => {
      const res = await disableStudentLoginAction(studentId)
      if (res.error) toast.error(res.error)
      else {
        setIssued(null)
        toast.success('Kullanıcı adı + PIN girişi kapatıldı.')
      }
    })
  }

  const shareText = issued
    ? `Merhaba ${studentName.split(' ')[0]}, İZ'e giriş bilgilerin:\n` +
      `Adres: ${typeof window !== 'undefined' ? window.location.origin : ''}/giris/ogrenci\n` +
      `Kullanıcı adı: ${issued.username}\nPIN: ${issued.pin}\nPIN'ini kimseyle paylaşma.`
    : ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText)
      toast.success('Giriş bilgileri kopyalandı.')
    } catch {
      toast.error('Kopyalanamadı; bilgileri elle iletin.')
    }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      {info && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <KeyRound className="size-4 text-muted-foreground" />
          Kullanıcı adı: <span className="font-mono font-medium">{info.username}</span>
          {!info.active && <Badge variant="neutral">Kapalı</Badge>}
          {info.active && info.locked && <Badge variant="warning">Geçici kilit (yanlış PIN)</Badge>}
          {info.active && !info.locked && <Badge variant="success">Açık</Badge>}
        </p>
      )}

      {issued && (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
          <p>
            Kullanıcı adı: <span className="font-mono font-semibold">{issued.username}</span>
          </p>
          <p>
            PIN: <span className="font-mono text-lg font-semibold tracking-widest">{issued.pin}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            PIN yalnız şimdi görünür. Öğrenciye iletin; unutursa yeni PIN üretin.
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
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={issue}>
          {pending && <Loader2 className="animate-spin" />}
          {info ? 'Yeni PIN üret' : 'Kullanıcı adı + PIN oluştur'}
        </Button>
        {info?.active && (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={disable}>
            Girişi kapat
          </Button>
        )}
      </div>
    </div>
  )
}
