import Link from 'next/link'
import { ArrowRight, Check, Circle } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// KURULUM ADIMLARI (Faz 4).
//
// SORUN: kayıt bir çalışma alanı açıyordu ama başka hiçbir şey
// oluşturmuyordu — dönem yok, kitap yok, öğrenci yok. Yeni kullanıcı
// bütün sayaçları sıfır olan bir panele bakıyor ve nereden başlayacağını
// gösteren hiçbir şey görmüyordu. Ücretli bir üründe ilk beş dakika
// dönüşümü belirler.
//
// SIRA GERÇEK BİR BAĞIMLILIK: dönem olmadan kitap atanamaz, kitap
// olmadan ödev verilemez. Bu yüzden numaralandırma burada süs değil,
// bilgi — adımlar gerçekten birbirine dayanıyor.
//
// TAMAMLANINCA KAYBOLUR. Kalıcı bir "başlangıç rehberi" kartı, işini
// kurmuş kullanıcıya her gün bitmiş bir işi hatırlatır.

export interface OnboardingState {
  hasTerm: boolean
  hasBook: boolean
  hasStudent: boolean
}

interface Step {
  title: string
  description: string
  href: string
  cta: string
  done: boolean
}

export function OnboardingChecklist({ state }: { state: OnboardingState }) {
  const steps: Step[] = [
    {
      title: 'Eğitim dönemi oluşturun',
      description:
        'Ödevler ve kitap atamaları bir döneme bağlanır. Aktif dönem olmadan öğrenciye kitap atanamaz.',
      href: '/teacher/terms',
      cta: 'Dönem oluştur',
      done: state.hasTerm,
    },
    {
      title: 'Kitap havuzuna bir kaynak ekleyin',
      description:
        'Havuz dönemden bağımsızdır: bir kez kurduğunuz kitabı sonraki yıllarda da kullanırsınız.',
      href: '/teacher/books/new',
      cta: 'Kitap ekle',
      done: state.hasBook,
    },
    {
      title: 'İlk öğrencinizi ekleyin',
      description:
        'Öğrenci kaydı hesap değildir; öğrenci kendi panelini görsün isterseniz ayrıca davet gönderirsiniz.',
      href: '/teacher/students/new',
      cta: 'Öğrenci ekle',
      done: state.hasStudent,
    },
  ]

  if (steps.every(s => s.done)) return null

  const doneCount = steps.filter(s => s.done).length
  // Sıradaki iş: tamamlanmamış İLK adım. Kullanıcı hangi adıma
  // odaklanacağını aramak zorunda kalmamalı.
  const nextIndex = steps.findIndex(s => !s.done)

  return (
    <section
      aria-labelledby="kurulum-basligi"
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
        <h2 id="kurulum-basligi" className="text-base font-semibold tracking-tight">
          Kuruluma devam edin
        </h2>
        <p className="text-xs tabular-nums text-muted-foreground">
          {doneCount} / {steps.length} adım tamam
        </p>
      </div>

      <ol className="divide-y">
        {steps.map((step, index) => {
          const isNext = index === nextIndex
          return (
            <li
              key={step.href}
              className={cn(
                'flex flex-wrap items-start gap-x-4 gap-y-3 px-5 py-4',
                step.done && 'opacity-60'
              )}
            >
              <span className="mt-0.5 shrink-0">
                {step.done ? (
                  <Check className="size-5 text-success-foreground" />
                ) : (
                  <Circle
                    className={cn(
                      'size-5',
                      isNext ? 'text-primary' : 'text-muted-foreground/40'
                    )}
                  />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', step.done && 'line-through')}>
                  {step.title}
                </p>
                {!step.done && (
                  <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                )}
              </div>

              {/* Yalnız SIRADAKİ adımda düğme: üç düğme birden göstermek
                  "hangisinden başlayayım?" sorusunu geri getirir. */}
              {isNext && (
                <Link
                  href={step.href}
                  className={buttonVariants({ size: 'sm', className: 'shrink-0' })}
                >
                  {step.cta}
                  <ArrowRight className="size-4" />
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
