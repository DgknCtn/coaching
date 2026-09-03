import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Ekran altı açıklama kartları.
//
// Müfredat Akışı ve Koruma Havuzu, kurallarını kullanıcıya anlatmak zorunda
// olan iki ekran: "son temas ne sayılır?", "sıralama neye göre?", "renk ne
// demek?". Bu bilgiler bugün ekranların altında tek bir uzun paragraf olarak
// duruyor ve okunmuyor.
//
// Kartlar kuralı MADDE MADDE gösterir; her maddenin isteğe bağlı bir tonu
// vardır (olumlu/olumsuz ayrımı için). Ton yalnız ikonu renklendirir —
// metin her zaman kendi başına anlaşılır olmalıdır.

export type ExplainerTone = 'default' | 'positive' | 'negative'

export interface ExplainerItem {
  text: string
  tone?: ExplainerTone
  icon?: LucideIcon
}

export interface ExplainerCard {
  title: string
  description?: string
  items: ExplainerItem[]
}

const TONE_CLASS: Record<ExplainerTone, string> = {
  default: 'text-muted-foreground',
  positive: 'text-success-foreground',
  negative: 'text-destructive-foreground',
}

export function ExplainerCards({
  cards,
  className,
}: {
  cards: ExplainerCard[]
  className?: string
}) {
  if (cards.length === 0) return null

  return (
    <div className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3', className)}>
      {cards.map(card => (
        <section key={card.title} className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-medium">{card.title}</h3>
          {card.description && (
            <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
          )}
          <ul className="mt-3 space-y-2">
            {card.items.map(item => {
              const Icon = item.icon
              return (
                <li key={item.text} className="flex gap-2 text-xs text-muted-foreground">
                  {Icon ? (
                    <Icon
                      aria-hidden
                      className={cn('mt-0.5 size-3.5 shrink-0', TONE_CLASS[item.tone ?? 'default'])}
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50"
                    />
                  )}
                  <span>{item.text}</span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
