import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AeroGuard | BPSU Fire Safety System',
  description: 'Raspberry Pi-based fire safety system for BPSU Main Campus',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
