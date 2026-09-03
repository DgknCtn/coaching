import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Native <select>, Input ile aynı görsel sözleşmede.
 * Bilinçli olarak ui/select (Base UI) değil: react-hook-form'un `register()`
 * çağrısı native select üzerinde uncontrolled çalışıyor; kontrollü bileşene
 * geçmek form davranışını değiştirirdi.
 */
function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          // text-base md:text-sm: iOS Safari 16px'in altındaki alanlara
          // odaklanınca sayfayı otomatik yakınlaştırıyor. Input ve textarea
          // aynı deseni zaten kullanıyor.
          'h-9 w-full appearance-none rounded-md border border-input bg-card px-3 py-1 pr-9 text-base md:text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export { NativeSelect }
