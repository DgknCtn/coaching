import { notFound } from 'next/navigation'

// Bu route group artık kullanılmıyor.
// Gerçek davet sayfası: app/invite/[token]/page.tsx → URL: /invite/:token
export default function OldInvitePage() {
  notFound()
}
