import type { Metadata } from 'next'

// Giriş sayfası 'use client' olduğu için metadata'yı kendisi veremez;
// ince bir layout bunun tek yolu. Sayfanın kendisini sunucu bileşenine
// çevirmek, formun tamamını yeniden yazmak demekti — kazanç yok.
export const metadata: Metadata = {
  title: 'Giriş Yap',
  description:
    'Öğrenci takip panelinize giriş yapın. Öğretmen, öğrenci ve veli hesapları için tek giriş.',
  alternates: { canonical: '/login' },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
