'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createPartnerAction } from './actions'

/**
 * YENİ PARTNER.
 *
 * 059'dan bu yana partner eklemenin tek yolu elle INSERT'tü — sayfanın
 * kendisi bunu bir yorumda tarif ediyordu. Anlaşma her yapıldığında
 * veritabanına bağlanmak gerekiyordu.
 *
 * KOD ALANI BOŞ BIRAKILABİLİR: çoğu durumda kodun ne olduğunun önemi
 * yok, üretilmesi yeter (generate_partner_code). Alan yine de duruyor
 * çünkü partner "kodum adım olsun" diyebilir ve bu makul bir istek.
 *
 * VARSAYILAN ORAN %10: veritabanındaki DEFAULT ile aynı. İkisi
 * ayrışırsa arayüzden eklenen partner ile elle eklenen farklı oran
 * alırdı, üstelik kimse fark etmezdi.
 */
export function NewPartnerDialog() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [percent, setPercent] = useState('10')
  const [notes, setNotes] = useState('')

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const parsed = Number(percent)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError('Komisyon oranı 0 ile 100 arasında bir yüzde olmalı.')
      return
    }

    startTransition(async () => {
      const res = await createPartnerAction({
        name,
        email,
        // Kodu burada büyütüyoruz ki kullanıcı küçük harfle yazdığında
        // sunucudan biçim hatası almasın — RPC de aynısını yapıyor,
        // ama hata mesajı görmek gereksiz bir sürtünme.
        code: code.trim().toUpperCase(),
        commissionPercent: parsed,
        notes,
      })

      if (res.error) {
        setError(res.error)
        return
      }

      toast.success(`Partner oluşturuldu. Kod: ${res.code}`)
      setOpen(false)
      setName('')
      setEmail('')
      setCode('')
      setPercent('10')
      setNotes('')
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus />
            Partner Ekle
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Yeni partner</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="partner-name">Ad soyad / firma</Label>
            <Input
              id="partner-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="partner-email">E-posta</Label>
            <Input
              id="partner-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={200}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              İsteğe bağlı. Partner bu adresle kaydolduğunda kendi panelini görür.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="partner-code">Kod</Label>
              <Input
                id="partner-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Otomatik"
                maxLength={20}
                autoComplete="off"
                className="uppercase"
              />
              <p className="text-xs text-muted-foreground">
                Boş bırakılırsa üretilir.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="partner-rate">Komisyon (%)</Label>
              <Input
                id="partner-rate"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.5}
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">KDV hariç tutar üzerinden.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="partner-notes">Not</Label>
            <Textarea
              id="partner-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              placeholder="Anlaşma koşulları, iletişim bilgisi…"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={pending || name.trim() === ''}>
              {pending ? 'Oluşturuluyor…' : 'Oluştur'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
