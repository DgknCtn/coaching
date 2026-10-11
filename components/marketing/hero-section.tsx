import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { TRIAL_CTA_LABEL, TRIAL_DAYS } from '@/lib/plans'
import { GuaranteeStrip } from './guarantee-strip'
import { PhonePreview } from './phone-preview'
import { StudentStatusBadge } from '@/components/shared/student-status-badge'
import { counterLabel } from '@/lib/homework-status'
import { demoStudents, demoSummary } from './demo/demo-students'

// HERO.
//
// ============================================================
// NE ANLATIYOR
//
// Başlık koçun her gün sorduğu soruyu adlandırıyor: kim yaptı, kim
// geride. Ürünün vaadi o sorunun cevabını tek bakışa indirmek. Alt
// cümle üç rolü tek satırda kuruyor; ayrıntı aşağıdaki bölümlerde.
//
// KİTLE ÇİPLERİ BURADA: önceden ayrı bir "Kimler için" bölümü vardı
// (AudienceSection, dosya duruyor). Okuyucu "bu benim için mi"
// sorusunun cevabını ilk ekranda görmeli, üç kart aşağıda değil.
//
// GÖRSEL İKİ EKRAN: koçun masaüstü paneli ve öğrencinin telefonu. Öğrenci
// ve veli ürünü telefonda kullanıyor; yalnız masaüstü göstermek bunu
// saklıyordu. Mobilde yalnız telefon görünür (masaüstü önizlemesi küçük
// ekranda okunmuyor); orta genişlikte ikisi yan yana sığmadığı için yalnız
// panel.
//
// SAYILAR VE SATIRLAR DEMO FİKSTÜRÜNDEN (demo-students.ts), etiketler
// ürünün durum sözlüğünden — /demo ile aynı sahne. Elle yazılmış rakam yok.
//
// KART İSTENMİYOR (058): deneme için kart bilgisi alınmıyor; güvence
// şeridi bunu CTA'nın hemen altında söylüyor.
// ============================================================

const summary = demoSummary()

const previewStats = [
  { label: 'Öğrenci', value: String(summary.students) },
  { label: `Bu hafta ${counterLabel('delivered').toLocaleLowerCase('tr')}`, value: `${summary.deliveredPercent}%` },
  { label: counterLabel('overdue'), value: String(summary.overdue) },
  { label: 'Dikkat isteyen', value: String(summary.needsAttention) },
]

const previewRows = demoStudents.slice(0, 4)

const AUDIENCE = ['Özel ders öğretmenleri', 'Eğitim koçları', 'Küçük koçluk ekipleri']

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b bg-background pt-28 pb-20 sm:pt-32 sm:pb-24">
      {/* Zemin ışığı — `--primary` token'ından, koyu temada da uyumlu. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--primary)_0%,transparent_70%)] opacity-[0.08]"
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            {TRIAL_DAYS} gün ücretsiz · Kart istenmez
          </p>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Kim ödevini yaptı, kim geride kaldı? Tek bakışta görün.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Siz ödevi verin ve onaylayın; öğrenci telefonundan teslim etsin, veli
            kendi ekranından takip etsin. WhatsApp mesajları, Excel listeleri ve
            &ldquo;Çocuğum nasıl gidiyor?&rdquo; soruları tek yerde biter.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/register" className={buttonVariants({ size: 'lg' })}>
              {TRIAL_CTA_LABEL}
              <ArrowRight />
            </Link>
            <Link href="/demo" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              Kayıtsız demoyu gör
            </Link>
          </div>

          <GuaranteeStrip className="mt-5" />

          <ul
            aria-label="Kimler için"
            className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground"
          >
            {AUDIENCE.map((a) => (
              <li key={a} className="rounded-full border bg-card px-3 py-1">
                {a}
              </li>
            ))}
          </ul>
        </div>

        {/* İKİ EKRAN: geniş ekranda panel + yanında telefon (panel telefon
            kadar daraltılır, durum rozetleri kapanmasın); orta genişlikte
            yalnız panel; mobilde yalnız telefon. */}
        <div className="relative mx-auto mt-16 max-w-5xl">
          <PhonePreview className="mx-auto md:hidden" />

          <div className="hidden md:block lg:pr-64">
            <div className="overflow-hidden rounded-xl border bg-card shadow-xl shadow-primary/5">
              {/* Sahte pencere çubuğu — kartın bir "ekran" olduğunu okutuyor. */}
              <div className="flex items-center gap-1.5 border-b bg-muted/40 px-4 py-2.5">
                <span className="size-2.5 rounded-full bg-destructive/40" />
                <span className="size-2.5 rounded-full bg-warning/40" />
                <span className="size-2.5 rounded-full bg-success/40" />
                <span className="ml-3 text-xs text-muted-foreground">Koç paneli</span>
              </div>

              <div className="grid grid-cols-4 gap-px bg-border">
                {previewStats.map((s) => (
                  <div key={s.label} className="bg-card p-4">
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <p className="text-sm font-semibold">Öğrenci durumu</p>
                  <p className="text-xs text-muted-foreground">{summary.students} öğrenci</p>
                </div>
                <ul className="divide-y">
                  {previewRows.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {r.signals[0] ?? `${r.exam} · ${r.grade}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {r.doneTasks}/{r.totalTasks}
                        </span>
                        <StudentStatusBadge status={r.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <PhonePreview className="absolute -bottom-10 right-0 hidden lg:block" />
        </div>
      </div>
    </section>
  )
}
