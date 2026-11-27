import { ArrowRight } from 'lucide-react'
import { featuresOf, publicCategories } from '@/lib/features/catalog'
import { CATEGORY_ICON } from './icons'
import { TrackedLink } from './tracking'

// KATEGORİ IZGARASI (PRD §7.3 Section 2): 8 kategori, ikon + kısa
// açıklama + "Detayları Gör". Mobilde 2 sütun.

export function FeatureCategoryGrid() {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {publicCategories().map(c => {
        const Icon = CATEGORY_ICON[c.icon]
        return (
          <li key={c.id}>
            <TrackedLink
              href={`#${c.slug}`}
              payload={{ event: 'feature_cta_click', category: c.slug, cta: 'kategori-kart', page: 'features' }}
              className="group flex h-full flex-col rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <span className="mt-3 text-sm font-semibold leading-snug">{c.name}</span>
              <span className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{c.description}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                Detayları Gör
                <span className="sr-only"> · {featuresOf(c.id).length} özellik</span>
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </TrackedLink>
          </li>
        )
      })}
    </ul>
  )
}
