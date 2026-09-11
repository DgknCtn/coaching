import type { Metadata } from 'next'
import { TRIAL_DAYS } from '@/lib/plans'

export const metadata: Metadata = {
  title: 'Ücretsiz Deneyin',
  description: `${TRIAL_DAYS} gün ücretsiz deneyin: öğrenci takibi, kitap haritası, haftalık ödev akışı ve veli paneli tek sistemde. Kredi kartı gerekmez.`,
  alternates: { canonical: '/register' },
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
