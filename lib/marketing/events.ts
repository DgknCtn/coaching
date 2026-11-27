import { z } from 'zod'

// PAZARLAMA OLAYLARI — PRD §14 (Feature Showcase). İstemci (track.ts),
// sunucu ucu (app/api/m/route.ts), migration 158'in CHECK listesi ve
// testler AYNI listeyi kullanır.
//
// KİŞİSEL VERİ YOK: kullanıcı kimliği, IP, çerez kimliği, e-posta, serbest
// metin TUTULMAZ. Alanlar kısa, beyaz listeli tanımlayıcılardır.

export const MARKETING_EVENTS = [
  'features_page_view',
  'feature_category_view',
  'feature_detail_view',
  'feature_screenshot_click',
  'feature_demo_click',
  'feature_trial_click',
  'feature_pricing_view',
  'feature_faq_open',
  'feature_cta_click',
  'homepage_feature_preview_view',
  'homepage_features_cta_click',
  'trial_started_from_features',
] as const

export type MarketingEvent = (typeof MARKETING_EVENTS)[number]

const slug = z
  .string()
  .trim()
  .max(48)
  .regex(/^[a-z0-9-]+$/)

export const marketingEventSchema = z
  .object({
    event: z.enum(MARKETING_EVENTS),
    feature: slug.optional(),
    category: slug.optional(),
    page: z.enum(['home', 'features', 'register']).optional(),
    cta: slug.optional(),
    device: z.enum(['mobile', 'tablet', 'desktop']).optional(),
    source: slug.optional(),
  })
  .strict()

export type MarketingEventPayload = z.infer<typeof marketingEventSchema>

/** Ekran genişliğinden kaba cihaz türü (PRD §9.1 kırılımları). */
export function deviceFromWidth(width: number): 'mobile' | 'tablet' | 'desktop' {
  if (width < 768) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}
