import { Navbar } from './navbar'
import { HeroSection } from './hero-section'
import { StatsBar } from './stats-bar'
import { FeaturesSection } from './features-section'
import { HowItWorks } from './how-it-works'
import { CommitmentsSection } from './commitments-section'
import { PricingSection } from './pricing-section'
import { FaqSection } from './faq-section'
import { DemoCta } from './demo-cta'
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
//    uzatmaktan başka bir işe yaramıyordu. Kaldırılınca fiyat bölümü
//    okuyucuya bir ekran daha yakın.
//
// 2. CommitmentsSection FİYATTAN HEMEN ÖNCE eklendi. Parayı konuşmadan
//    önceki son durak; hem güven veriyor hem de kayıt olmadan görülebilen
//    demoya yönlendiriyor. Kart isteyen bir akışta "önce gör, sonra
//    kaydol" diyebilmek en güçlü koz.
//
// 3. SSS fiyatlandırmadan SONRA kaldı ama içeriği yeniden sıralandı:
//    kart, iptal ve iade soruları en üstte. İtiraz, fiyatı gördükten
//    hemen sonra karşılanmalı.
//
// 4. StickyCta yalnız mobilde: uzun sayfada, ikna olmuş okuyucunun
//    basacağı bir şey her zaman ekranda olsun.
// ============================================================

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <StatsBar />
      <FeaturesSection />
      <HowItWorks />
      <CommitmentsSection />
      <PricingSection />
      <FaqSection />
      <DemoCta />
      <Footer />
      <StickyCta />
    </div>
  )
}
