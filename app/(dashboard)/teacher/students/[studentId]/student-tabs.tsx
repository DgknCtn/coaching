'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { LinkTabs, type LinkTab } from '@/components/shared/link-tabs'
import { studentContextNav } from '@/components/nav-config'
import {
  LAST_STUDENT_COOKIE,
  LAST_STUDENT_MAX_AGE_SECONDS,
} from '@/lib/last-student'

/**
 * Öğrenci çalışma masasının sekme şeridi.
 *
 * NEDEN CLIENT: aktif sekme pathname ve sorgu dizesinden türetiliyor;
 * layout bir server component olduğu için ikisini de okuyamıyor.
 * Sekmelerin KENDİSİ yine de gerçek birer bağlantı (LinkTabs) —
 * paylaşılabilir, yer imlenebilir ve geri tuşuyla gezilebilir kalıyorlar;
 * client olan yalnız "hangisi aktif" kararı.
 *
 * SEKME LİSTESİ TEK KAYNAKTAN: studentContextNav (components/nav-config.ts)
 * hem Genel Bakış panellerini (?sekme=...) hem beş ekranı üretiyor. Burada
 * ikinci bir liste tutulsaydı, yeni bir sekme eklendiğinde biri
 * güncellenip diğeri unutulurdu.
 */
export function StudentTabs({ studentId }: { studentId: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const items = studentContextNav(studentId)
  const base = `/teacher/students/${studentId}`

  // SON ÇALIŞILAN ÖĞRENCİ (bkz. lib/last-student.ts): menüden bir ekran
  // seçildiğinde öğrenci listesinin atlanabilmesi için. Çerez burada
  // yazılıyor çünkü layout'lar Next 15'te çerez yazamaz; değer bir
  // tercih olduğundan httpOnly olması da gerekmiyor.
  useEffect(() => {
    document.cookie = `${LAST_STUDENT_COOKIE}=${studentId}; path=/; max-age=${LAST_STUDENT_MAX_AGE_SECONDS}; SameSite=Lax`
  }, [studentId])

  const tabs: LinkTab[] = items.map((item) => ({
    key: item.href,
    label: item.label,
    href: item.href,
  }))

  // AKTİF SEKME İKİ AŞAMADA.
  //
  // Genel Bakış rotasındayken sekmeyi belirleyen şey YOL DEĞİL sorgu
  // parametresi: altı bağlantının da yolu aynı. Alt rotalarda ise sorgu
  // hiç rol oynamaz ve en UZUN eşleşen yol kazanır — "Genel Bakış" her
  // alt rotanın öneki olduğu için basit bir startsWith'te hep aktif
  // çıkardı.
  let activeKey = ''
  if (pathname === base) {
    const sekme = searchParams.get('sekme')
    activeKey = sekme ? `${base}?sekme=${sekme}` : base
    // Tanınmayan bir ?sekme= değeri: sayfa özeti gösteriyor, şerit de
    // Genel Bakış'ı işaretlemeli — hiçbiri işaretli olmayan bir şerit
    // "buraya nasıl geldim" sorusunu doğurur.
    if (!tabs.some((t) => t.key === activeKey)) activeKey = base
  } else {
    activeKey =
      tabs
        .filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
        .sort((a, b) => b.href.length - a.href.length)[0]?.key ?? ''
  }

  return (
    <LinkTabs
      tabs={tabs}
      activeKey={activeKey}
      ariaLabel="Öğrenci ekranları"
      className="px-6 md:px-8"
    />
  )
}
