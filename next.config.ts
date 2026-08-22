import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // lucide-react barrel dosyasından import ediliyor (ör. `import { Check,
    // Clock3 } from 'lucide-react'`). Bu ayar olmadan geliştirme derlemesi
    // paketin tamamını çözümlemek zorunda kalıyor. Yalnız derleme/bundle
    // düzeyinde çalışır — çalışma zamanı davranışı aynıdır.
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
