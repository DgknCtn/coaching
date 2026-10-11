'use client'

import { useEffect, useState } from 'react'
import { Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// "ANA EKRANA EKLE" İPUCU — öğrenci ve veli panellerinde, bir kez.
//
// Öğrenci ve veli uygulamayı telefonda açıyor; ana ekrana eklenmezse her
// seferinde tarayıcıda adresi arıyorlar ve günlük alışkanlık oluşmuyor.
// Manifest ve ikonlar zaten var (app/manifest.ts); eksik olan, kullanıcıya
// bunun mümkün olduğunu söylemekti.
//
// GÖRÜNMEDİĞİ DURUMLAR: masaüstü, uygulama zaten ana ekrandan açılmış
// (standalone) ya da kullanıcı ipucunu kapatmış. Kapatma bu cihazın
// tarayıcısında saklanır; depolama kapalıysa ipucu yine kapatılabilir,
// yalnız bir sonraki açılışta tekrar görünür.

const STORAGE_KEY = 'iz.install-hint.dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function InstallHint() {
  const [visible, setVisible] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    const mobile = window.matchMedia('(pointer: coarse) and (max-width: 768px)').matches
    if (standalone || !mobile || readDismissed()) return

    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent))
    setVisible(true)

    // Android/Chrome: tarayıcının kendi yükleme penceresi düğmeye bağlanır.
    function onPrompt(e: Event) {
      e.preventDefault()
      setPromptEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function dismiss() {
    setVisible(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Depolama kapalı (gizli pencere vb.): yalnız bu açılış için gizlenir.
    }
  }

  async function install() {
    if (!promptEvent) return
    await promptEvent.prompt()
    dismiss()
  }

  if (!visible) return null

  return (
    <div
      role="note"
      className="mx-4 mt-4 flex items-start gap-3 rounded-lg border bg-muted/40 px-3 py-3 text-sm"
    >
      <Smartphone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-medium">Ana ekrana ekle, uygulama gibi açılsın.</p>
        {promptEvent ? (
          <Button type="button" size="sm" onClick={install}>
            Ana ekrana ekle
          </Button>
        ) : (
          <p className="text-muted-foreground">
            {isIos
              ? 'Safari’de alttaki Paylaş düğmesine dokun, sonra “Ana Ekrana Ekle”yi seç.'
              : 'Tarayıcı menüsünden (⋮) “Ana ekrana ekle” ya da “Uygulamayı yükle”yi seç.'}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="İpucunu kapat"
        className="-m-1 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}
