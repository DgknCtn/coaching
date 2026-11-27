import { Navbar } from './navbar'
import { HeroSection } from './hero-section'
import { BeforeAfterSection } from './before-after-section'
import { FeaturePreview } from './features/feature-preview'
import { ApprovalSection } from './approval-section'
import { FounderSection } from './founder-section'
import { TestimonialsSection } from './testimonials-section'
import { HowItWorks } from './how-it-works'
import { CommitmentsSection } from './commitments-section'
import { PricingSection } from './pricing-section'
import { FaqSection } from './faq-section'
import { ClosingCta } from './closing-cta'
import { Footer } from './footer'
import { StickyCta } from './sticky-cta'
import { ProductTour } from './product-tour'
import { ComparisonSection } from './comparison-section'
import { SetupSection } from './setup-section'

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
//
// 27 KASIM 2026 (göster, anlatma):
// 12. ProductTour Önce/Sonra'nın hemen ardında: okuyucu derdinin
//     tanındığını gördükten sonra ÇÖZÜMÜ GÖRMELİ — madde listesi değil,
//     uygulamanın gerçek bileşenleriyle çizilmiş beş ekran (ödev, öğrenci,
//     ders & takvim, finans, veli). #ozellikler bağlantısı artık buraya.
// 13. ParentSection SAYFADAN ÇIKTI (dosya duruyor): veli paneli turun bir
//     sekmesi. ApprovalSection kalıyor — "onaylı ilerleme" ürünün asıl
//     farkı ve veli verisinin neden güvenilir olduğunu açıklıyor.
// 14. ComparisonSection onayın ardından: farkı gören okuyucu "neden
//     WhatsApp + Excel değil?" diye sorar; cevap yan yana tablo.
// 15. FeaturesSection (roller) karşılaştırmadan sonra, kısa özet olarak.
// 17. (28.11.2026, Feature Showcase PRD §8) FeaturesSection (roller)
//     /ozellikler'e TAŞINDI; yerinde FeaturePreview: katalogdaki öne
//     çıkan özellikler + "Tüm Özellikleri Keşfet". Anasayfa kataloğun
//     tamamını tekrarlamaz (PRD §8.3).
// 16. SetupSection kurucudan ÖNCE: "kurması zor mu?" itirazı fiyata
//     inmeden karşılanır; HowItWorks'ün üç adımı onu tamamlar.
// ============================================================

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <BeforeAfterSection />
      <ProductTour />
      <ApprovalSection />
      <ComparisonSection />
      <FeaturePreview />
      <SetupSection />
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
