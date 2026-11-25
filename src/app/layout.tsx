import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Rajdhani, Chakra_Petch } from "next/font/google";
import "./globals.css";
import { Providers } from "../components/common/Providers";
import { THEME_META_MAP, DEFAULT_THEME } from "../lib/themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const rajdhani = Rajdhani({
  variable: "--font-hud",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const chakraPetch = Chakra_Petch({
  variable: "--font-hud-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050507",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://studyio-web.vercel.app"),
  applicationName: "study.io",
  title: "study.io — The Focus App Built for Rank-Chasing Students",
  description: "Lock down distractions on your phone, track deep work with precision timers, and climb 23 seasonal ranks from Bronze to Grandmaster.",
  openGraph: {
    title: "study.io — The Focus App Built for Rank-Chasing Students",
    description: "Lock down distractions on your phone, track deep work with precision timers, and climb 23 seasonal ranks from Bronze to Grandmaster.",
    url: "https://studyio-web.vercel.app",
    siteName: "study.io",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "study.io brand logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "study.io — The Focus App Built for Rank-Chasing Students",
    description: "Lock down distractions on your phone, track deep work with precision timers, and climb 23 seasonal ranks from Bronze to Grandmaster.",
    images: ["/logo.png"],
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico?v=3", sizes: "48x48", type: "image/x-icon" },
      { url: "/favicon.svg?v=3", type: "image/svg+xml" },
      { url: "/icon-192.png?v=3", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png?v=3", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=3",
    apple: [
      { url: "/apple-touch-icon.png?v=3", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "study.io",
  },
  verification: {
    google: "googlefeaf0a2a16a77d0d",
  },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://studyio-web.vercel.app/#website",
  "name": "study.io",
  "alternateName": ["study.io", "Study.io", "studyio", "StudyIO", "Study.io Web"],
  "url": "https://studyio-web.vercel.app/",
  "image": "https://studyio-web.vercel.app/logo.png",
  "publisher": {
    "@type": "Organization",
    "name": "study.io",
    "logo": {
      "@type": "ImageObject",
      "url": "https://studyio-web.vercel.app/logo.png"
    }
  }
};

const inlineSwScript = `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});});}`;

const inlineThemeScript = `(function(){try{var m=${JSON.stringify(THEME_META_MAP)};var t=localStorage.getItem('studyio-theme')||'rank';if(!m[t])t='rank';var e=m[t];document.documentElement.dataset.theme=t;if(e.scheme==='light'){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');}else{document.documentElement.classList.remove('light');document.documentElement.classList.add('dark');}document.documentElement.style.backgroundColor=e.themeColor;var tc=document.getElementById('theme-color-meta');if(tc)tc.setAttribute('content',e.themeColor);var cs=document.getElementById('color-scheme-meta');if(cs)cs.setAttribute('content',e.scheme);var as=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');if(as)as.setAttribute('content',e.scheme==='light'?'default':'black-translucent');if(window.Capacitor&&((typeof window.Capacitor.isNativePlatform==='function'&&window.Capacitor.isNativePlatform())||window.Capacitor.isNative)&&((typeof window.Capacitor.getPlatform==='function'&&window.Capacitor.getPlatform()==='android')||window.Capacitor.platform==='android')){document.documentElement.classList.add('native-android');}}catch(e){document.documentElement.dataset.theme='rank';}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${rajdhani.variable} ${chakraPetch.variable} dark antialiased`}
    >
      <head>
        <meta name="theme-color" id="theme-color-meta" content="#050507" />
        <meta name="color-scheme" id="color-scheme-meta" content={DEFAULT_THEME.scheme} />
        <meta name="application-name" content="study.io" />
        <meta property="og:site_name" content="study.io" />
        <meta name="site_name" content="study.io" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico?v=3" sizes="48x48" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=3" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=3" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png?v=3" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=3" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="preload"
          as="image"
          href="/landing-shots/hero-timer.webp"
          type="image/webp"
          fetchPriority="high"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&family=Space+Grotesk:wght@600;700&display=swap"
          rel="stylesheet"
          media="print"
          // @ts-expect-error - Next.js inline onLoad for non-blocking fonts
          onLoad="this.media='all'"
        />
        <noscript>
          <link
            href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&family=Space+Grotesk:wght@600;700&display=swap"
            rel="stylesheet"
          />
        </noscript>
        <script
          dangerouslySetInnerHTML={{
            __html: inlineThemeScript,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: inlineSwScript,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteJsonLd),
          }}
        />
      </head>
      <body className="min-h-screen overflow-x-clip flex flex-col text-[var(--text)] bg-[#050507] dark antialiased selection:bg-[var(--accent)]/30 selection:text-[var(--accent)]">
        {/* Infinite Edge-to-Edge Background Canvas to eliminate visual gaps in portrait & landscape */}
        <div
          aria-hidden="true"
          className="fixed inset-0 w-screen h-screen overflow-x-hidden -z-50 bg-[#050507] pointer-events-none"
        />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
