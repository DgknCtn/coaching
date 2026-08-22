import { Navbar } from './navbar'
import { HeroSection } from './hero-section'
import { StatsBar } from './stats-bar'
import { FeaturesSection } from './features-section'
import { HowItWorks } from './how-it-works'
import { FeatureGrid } from './feature-grid'
import { PricingSection } from './pricing-section'
import { FaqSection } from './faq-section'
import { DemoCta } from './demo-cta'
import { Footer } from './footer'

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <StatsBar />
      <FeaturesSection />
      <HowItWorks />
      <FeatureGrid />
      <PricingSection />
      <FaqSection />
      <DemoCta />
      <Footer />
    </div>
  )
}
