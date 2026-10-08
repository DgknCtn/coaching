import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Koç Girişi',
  description:
    'Koç ve öğretmen paneline giriş yapın. Öğrenci ve veliler /giris adresinden girer.',
  alternates: { canonical: '/login' },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
