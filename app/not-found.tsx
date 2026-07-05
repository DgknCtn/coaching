import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground px-6 text-center">
      <h1 className="text-5xl font-black tracking-tight">404</h1>
      <p className="text-muted-foreground">Aradığınız sayfa bulunamadı.</p>
      <Link
        href="/"
        className="text-sm text-primary font-semibold hover:underline underline-offset-4"
      >
        Ana sayfaya dön
      </Link>
    </div>
  )
}
