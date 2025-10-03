import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletContextProvider } from "@/components/walletContextProvider";
import { ThemeProvider } from "@/components/theme-provider"; // Import the provider

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Saros DLMM | Advanced Liquidity Solutions",
  description: "Create, manage, and optimize concentrated liquidity positions on the Solana blockchain with Saros DLMM.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`min-h-screen bg-background font-sans antialiased ${inter.variable}`}>
        <ThemeProvider>
          <WalletContextProvider>
            <div className="relative flex min-h-screen flex-col">
              {children}
            </div>
          </WalletContextProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}