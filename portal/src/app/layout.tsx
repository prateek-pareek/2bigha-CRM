import type { Metadata } from "next";
import "./globals.css";
import AuthGuard from "@/components/AuthGuard";
import Providers from "@/components/Providers";
import PermissionRefreshBanner from "@/components/PermissionRefreshBanner";


export const metadata: Metadata = {
  title: "Mathionix CRM",
  description: "Mathionix CRM — sales pipeline, outreach, and client management",
  icons: {
    icon: [{ url: "/brand/mathionix-favicon.png", type: "image/png" }],
    shortcut: "/brand/mathionix-favicon.png",
    apple: "/brand/mathionix-favicon.png",
  },
};

import RealtimeManager from "@/components/RealtimeManager";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Golos+Text:wght@400;500;600;700&family=Inter+Tight:wght@100..900&family=Inter:wght@100..900&display=swap" rel="stylesheet" />
      </head>
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        <Providers>
          <RealtimeManager />
          <AuthGuard>
            {children}
          </AuthGuard>
        </Providers>
      </body>
    </html>
  );
}
