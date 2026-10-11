import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Giriş',
  description:
    'Koçlar e-posta ve şifreyle, öğrenci ve veliler öğretmenin verdiği kullanıcı adı ve PIN ile giriş yapar.',
  alternates: { canonical: '/login' },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
