import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AeroGuard | BPSU Fire Safety System',
  description: 'Raspberry Pi-based fire safety system for BPSU Main Campus',
  manifest: '/manifest.json',
  themeColor: '#0a0e1a',
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Runs before paint so a saved "light" choice doesn't flash dark first. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('ag-theme')==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
