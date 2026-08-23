"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  // Tema sabit "light" yazılıydı: koyu temada bildirimler beyaz kalıyordu.
  // richColors (app/layout.tsx) sonner'ın kendi paletini devreye soktuğu
  // için theme'in doğru gitmesi şart. resolvedTheme henüz bilinmiyorsa
  // (ilk render) açık temaya düşülür — provider'ın varsayılanı da bu.
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
