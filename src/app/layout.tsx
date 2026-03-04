import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import pkg from "../../package.json";
import { UpdateStatusBar } from "@/components/UpdateStatusBar";
import { AppVersionBadge } from "@/components/AppVersionBadge";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

const appVersion = pkg.version ?? "";

export const metadata: Metadata = {
  title: "Photo Grid Printer | Grid de fotos para impresión",
  description: "Crea grids de fotos y exporta a PDF a 300 DPI para impresión.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${outfit.variable} font-sans antialiased`} suppressHydrationWarning>
        <UpdateStatusBar />
        <AppVersionBadge version={appVersion} />
        {children}
      </body>
    </html>
  );
}
