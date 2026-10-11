import { Navbar } from './navbar'
import { HeroSection } from './hero-section'
import { BeforeAfterSection } from './before-after-section'
import { FeaturesSection } from './features-section'
import { ApprovalSection } from './approval-section'
import { ParentSection } from './parent-section'
import { FounderSection } from './founder-section'
import { TestimonialsSection } from './testimonials-section'
import { HowItWorks } from './how-it-works'
import { CommitmentsSection } from './commitments-section'
import { PricingSection } from './pricing-section'
import { FaqSection } from './faq-section'
import { ClosingCta } from './closing-cta'
import { Footer } from './footer'
import { StickyCta } from './sticky-cta'

// SAYFA SIRASI — satış akışına göre kuruldu.
//
// ============================================================
// NE DEĞİŞTİ VE NEDEN
//
// 1. FeatureGrid SAYFADAN ÇIKARILDI (dosya duruyor). FeaturesSection ile
//    içerik olarak büyük ölçüde çakışıyordu: risk analizi, davet sistemi,
//    kitap havuzu, ödev takibi — hepsi rol kartlarının içinde zaten
//    sayılıyor. İki ardışık kart ızgarası, fiyatlandırmaya inen yolu
//    uzatmaktan başka bir işe yaramıyordu.
//
// 2. StatsBar da AYNI GEREKÇEYLE ÇIKARILDI (dosya duruyor). Dört
//    maddesinin ikisi yeni bölümlerin başlığı hâline geldi: "Üç rol, tek
//    sistem" artık FeaturesSection'ın başlığı, "Öğretmen onaylı ilerleme"
//    ise kendi bölümü (ApprovalSection). Kalan ikisi ("test ve sayfa
//    takibi", "veri yalıtımı") FeaturesSection ve CommitmentsSection
//    içinde zaten söyleniyordu. Aynı şeyi iki kez, iki farklı cümleyle
//    söylemek okuyucuyu ikna etmiyor, yalnız sayfayı uzatıyor.
//
// 3. AudienceSection HERO'DAN HEMEN SONRA: sayfa "ne yapar" sorusunu iyi
//    cevaplıyordu ama "bu benim için mi" sorusunu hiç cevaplamıyordu.
//    Okuyucu kendini listede göremezse kalan her şeyi başkasına
//    anlatılan bir ürün olarak okur.
//
// 4. BeforeAfterSection nitelendirmenin hemen ardında: okuyucu kendini
//    tanıdıktan sonra ilk merak ettiği şey neyin değişeceği.
//
// 5. ApprovalSection -> ParentSection SIRASI BAĞIMLI: velinin gördüğü
//    veri, öğretmenin ONAYLADIĞI veri. Veli bölümü tek başına dursaydı
//    "veli her şeyi görüyor" gibi okunurdu.
//
// 6. CommitmentsSection FİYATTAN HEMEN ÖNCE: parayı konuşmadan önceki
//    son durak.
//
// 7. SSS fiyatlandırmadan SONRA: kart, iptal ve iade soruları en üstte.
//    İtiraz, fiyatı gördükten hemen sonra karşılanmalı.
//
// 8. StickyCta yalnız mobilde: uzun sayfada, ikna olmuş okuyucunun
//    basacağı bir şey her zaman ekranda olsun.
//
// 11 EKİM 2026 (ikna eden sürüm):
// 9. AudienceSection SAYFADAN ÇIKTI (dosya duruyor): kitle çipleri hero'da;
//    "bu benim için mi" sorusu ilk ekranda cevaplanıyor (madde 3'ün yerine).
// 10. FounderSection veli bölümünden SONRA: ne yaptığını gören okuyucu
//    şimdi "bunu kim, neden yaptı" diye sorar. Bir öğretmenin kendi
//    öğrencileri için yaptığı ürün, sayfadaki en güçlü güven kanıtı.
// 11. TestimonialsSection hemen ardından; yalnız gerçek ve izinli sözler
//    (lib/testimonials.ts), liste boşken hiç çizilmez.
// ============================================================

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <BeforeAfterSection />
      <FeaturesSection />
      <ApprovalSection />
      <ParentSection />
      <FounderSection />
      <TestimonialsSection />
      <HowItWorks />
      <CommitmentsSection />
      <PricingSection />
      <FaqSection />
      <ClosingCta />
      <Footer />
      <StickyCta />
    </div>
  )
}
