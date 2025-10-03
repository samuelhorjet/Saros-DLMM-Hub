"use client";

import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRouter } from 'next/navigation';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { LayoutDashboard, Waves, FolderKanban, Layers } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Skeleton } from '@/components/ui/skeleton'; // Make sure Skeleton is imported

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { connected, connecting } = useWallet();
  const router = useRouter();
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    if (!connecting) {
      setIsVerifying(false);
    }
  }, [connecting]);

  useEffect(() => {
    if (!isVerifying && !connected) {
      router.push('/');
    }
  }, [isVerifying, connected, router]);

  // --- THIS IS THE NEW LOADING STATE ---
  if (isVerifying) {
    return (
      <div className="flex min-h-screen w-full flex-col">
        {/* Render the actual header during loading to prevent it from popping in later */}
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
        {/* Render a skeleton placeholder for the page content */}
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
            <div className='space-y-2'>
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96" />
            </div>
            <Skeleton className="h-96 w-full rounded-xl" />
        </main>
      </div>
    );
  }

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

  return (
    <div className="flex h-screen w-full items-center justify-center">
        <p className="text-muted-foreground">Redirecting...</p>
    </div>
  );
}