"use client";

import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRouter } from 'next/navigation';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { LayoutDashboard, Waves, FolderKanban, Layers, Loader2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { connected, connecting } = useWallet();
  const router = useRouter();

  // We will track two separate conditions for showing the loading screen
  const [isWalletChecked, setIsWalletChecked] = useState(false);
  const [isMinTimePassed, setIsMinTimePassed] = useState(false);

  useEffect(() => {
    // Condition 1: Wait for the wallet adapter to finish its initial check.
    // The `connecting` state will be true on page load and false when done.
    if (!connecting) {
      setIsWalletChecked(true);
    }
  }, [connecting]);

  useEffect(() => {
    // Condition 2: Enforce a minimum loading time of 1.5 seconds.
    // This prevents content flashing and gives the wallet adapter ample time.
    const timer = setTimeout(() => {
      setIsMinTimePassed(true);
    }, 3000); // 1.5-second delay

    // Cleanup the timer if the component unmounts
    return () => clearTimeout(timer);
  }, []); // The empty dependency array ensures this runs only once on mount

  // The final loading state depends on BOTH conditions being met.
  const isLoading = !isWalletChecked || !isMinTimePassed;

  useEffect(() => {
    // Only perform the redirect check *after* the loading phase is complete.
    if (!isLoading && !connected) {
      router.push('/');
    }
  }, [isLoading, connected, router]);

  // --- MODERN LOADING STATE ---
  // While loading, we show a full-page skeleton.
  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
          <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
            <a href="/dashboard" className="flex items-center gap-2 font-bold text-foreground">
              <Layers className="h-6 w-6" />
              <span>Saros DLMM</span>
            </a>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-28" />
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <ThemeToggle />
            <WalletMultiButton />
          </div>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 md:gap-8 md:p-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Verifying wallet connection...</p>
        </main>
      </div>
    );
  }

  // If loading is complete and the user is connected, show the page content.
  if (connected) {
    return (
      <div className="flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
          <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
            <a href="/dashboard" className="flex items-center gap-2 font-bold text-foreground">
              <Layers className="h-6 w-6" />
              <span>Saros DLMM</span>
            </a>
            <a href="/dashboard" className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </a>
            <a href="/pools" className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
              <Waves className="h-4 w-4" />
              Pools
            </a>
            <a href="/positions" className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
              <FolderKanban className="h-4 w-4" />
              My Positions
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <ThemeToggle />
            <WalletMultiButton />
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
          {children}
        </main>
      </div>
    );
  }

  // If loading is done and user is not connected, show a redirecting message.
  return (
    <div className="flex h-screen w-full items-center justify-center">
        <p className="text-muted-foreground">Redirecting to home page...</p>
    </div>
  );
}