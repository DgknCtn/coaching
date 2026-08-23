/**
 * Landing bölümlerinin ortak başlık bloğu.
 *
 * Her bölüm daha önce kendi başlık işaretlemesini tekrar ediyordu ve
 * ölçekler bölümden bölüme kayıyordu. Tek yerden yönetilen bir kalıp,
 * sayfanın dikey ritmini tutarlı tutuyor.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow: string
  title: string
  description?: string
  className?: string
}) {
  return (
    <div className={className ?? 'mx-auto max-w-2xl text-center'}>
      <p className="text-xs font-medium uppercase tracking-wider text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {title}
      </h2>
      {description && (
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">{description}</p>
      )}
    </div>
  )
}
