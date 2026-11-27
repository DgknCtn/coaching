import Link from 'next/link'
import { ArrowRight, CheckCircle2, Sparkles, Users } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { TRIAL_CTA_LABEL, TRIAL_DAYS } from '@/lib/plans'
import { GuaranteeStrip } from './guarantee-strip'
import { PhonePreview } from './phone-preview'
import { StudentListMock } from './mock/student-list-mock'
import { FloatingCard } from './mock/floating-card'
import { registerHref } from '@/lib/signup-source'

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
            Ödevi verin ve onaylayın; öğrenci telefonundan teslim etsin, veli kendi
            ekranından görsün. Dersleriniz, ödemeleriniz ve kitap takibi de aynı yerde.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href={registerHref('hero')} className={buttonVariants({ size: 'lg' })}>
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

        {/* KATMANLI SAHNE (landing yenilemesi 27.11.2026): koç paneli +
            öğrencinin telefonu + iki yüzen an ("teslim etti → onayla",
            "veli onaylı ilerlemeyi gördü"). Üç rolü tek görüntüde anlatır.
            Mobilde: telefon + tek kart; orta genişlikte panel; geniş
            ekranda hepsi. */}
        <div className="relative mx-auto mt-16 max-w-5xl">
          <div className="relative mx-auto w-fit md:hidden">
            <PhonePreview />
            <FloatingCard
              className="absolute -bottom-6 -left-10 w-56"
              icon={<CheckCircle2 className="size-4" />}
              title="Ayşe Y. teslim etti"
              detail="Denklemler · Test 4-6"
              action="Onayla"
              delayMs={300}
            />
          </div>

          <div className="hidden md:block lg:pr-72">
            <StudentListMock />
          </div>

          <PhonePreview className="absolute -bottom-12 right-0 hidden lg:block" />

          {/* Kartlar içerik kapatmasın: biri panelin ÜST kenarında (pencere
              çubuğu hizası), diğeri ALT kenarında, satırların dışında. */}
          <FloatingCard
            className="absolute -top-9 right-80 hidden xl:flex"
            icon={<CheckCircle2 className="size-4" />}
            title="Ayşe Y. teslim etti"
            detail="Denklemler · Test 4-6"
            action="Onayla"
            delayMs={400}
          />
          <FloatingCard
            className="absolute -bottom-16 left-[32%] hidden lg:flex"
            icon={<Users className="size-4" />}
            title="Veli paneli güncellendi"
            detail="Bu hafta 7/8 çalışma öğretmen onaylı"
            delayMs={900}
          />
        </div>
      </div>
    </section>
  )
}
