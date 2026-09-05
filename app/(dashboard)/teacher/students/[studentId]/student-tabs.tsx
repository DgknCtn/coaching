'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { LinkTabs, type LinkTab } from '@/components/shared/link-tabs'
import { studentContextNav } from '@/components/nav-config'
import {
  LAST_STUDENT_COOKIE,
  LAST_STUDENT_MAX_AGE_SECONDS,
} from '@/lib/last-student'

/**
 * Öğrenci çalışma masasının sekme şeridi.
 *
 * NEDEN CLIENT: aktif sekme pathname'den türetiliyor ve layout bir server
 * component olduğu için pathname'i okuyamıyor. Sekmelerin KENDİSİ yine de
 * gerçek birer bağlantı (LinkTabs) — paylaşılabilir, yer imlenebilir ve
 * geri tuşuyla gezilebilir kalıyorlar; client olan yalnız "hangisi
 * aktif" kararı.
 *
 * SEKME LİSTESİ TEK KAYNAKTAN: studentContextNav (components/nav-config.ts)
 * zaten "Genel Bakış + beş ekran" dizisini üretiyor. Burada ikinci bir
 * liste tutulsaydı, yeni bir ekran eklendiğinde biri güncellenip diğeri
 * unutulurdu.
 */
export function StudentTabs({ studentId }: { studentId: string }) {
  const pathname = usePathname()
  const items = studentContextNav(studentId)

  // SON ÇALIŞILAN ÖĞRENCİ (bkz. lib/last-student.ts): menüden bir ekran
  // seçildiğinde öğrenci listesinin atlanabilmesi için. Çerez burada
  // yazılıyor çünkü layout'lar Next 15'te çerez yazamaz; değer bir
  // tercih olduğundan httpOnly olması da gerekmiyor.
  useEffect(() => {
    document.cookie = `${LAST_STUDENT_COOKIE}=${studentId}; path=/; max-age=${LAST_STUDENT_MAX_AGE_SECONDS}; SameSite=Lax`
  }, [studentId])

  // En UZUN eşleşen yol kazanır: "Genel Bakış" (/students/<id>) her alt
  // rotanın öneki olduğu için basit bir startsWith'te hep aktif çıkardı.
  const tabs: LinkTab[] = items.map((item) => ({
    key: item.href,
    label: item.label,
    href: item.href,
  }))

  const activeKey =
    tabs
      .filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.key ?? ''

  return (
    <LinkTabs
      tabs={tabs}
      activeKey={activeKey}
      ariaLabel="Öğrenci ekranları"
      className="px-6 md:px-8"
    />
  )
}
