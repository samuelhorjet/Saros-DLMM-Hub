// src/app/dashboard/page.tsx
"use client";
import React, { useMemo, useEffect } from "react";
import { LiquidityBookServices, MODE } from "@saros-finance/dlmm-sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider, setProvider } from "@coral-xyz/anchor";
import { Dashboard } from "@/components/Dashboard";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Waves, FolderKanban, Layers } from "lucide-react";

const DashboardContent = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { connected, publicKey } = wallet;
  const router = useRouter();

  const sdk = useMemo(() => {
    if (!connected || !wallet.publicKey) return null;
    try {
      const provider = new AnchorProvider(connection, wallet as any, AnchorProvider.defaultOptions());
      setProvider(provider);
      return new LiquidityBookServices({ mode: MODE.DEVNET });
    } catch (error) {
      console.error("Error initializing SDK:", error);
      return null;
    }
  }, [connected, connection, wallet]);

  useEffect(() => {
    if (!connected) {
      router.push('/');
    }
  }, [connected, router]);

  const handleNavigation = (section: 'pools' | 'positions') => {
    router.push(`/${section}`);
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
        <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
          <a href="/dashboard" className="flex items-center gap-2 font-bold text-foreground">
            <Layers className="h-6 w-6" />
            <span>Saros DLMM</span>
          </a>
          <a
            href="/dashboard"
            className="flex items-center gap-2 text-foreground transition-colors hover:text-foreground/80"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </a>
          <a
            href="/pools"
            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground/80"
          >
            <Waves className="h-4 w-4" />
            Pools
          </a>
          <a
            href="/positions"
            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground/80"
          >
            <FolderKanban className="h-4 w-4" />
            My Positions
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <WalletMultiButton />
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        {!connected || !sdk || !publicKey ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-muted-foreground">Initializing Dashboard...</p>
          </div>
        ) : (
          <Dashboard sdk={sdk} onNavigate={handleNavigation} />
        )}
      </main>
    </div>
  );
};

export default function DashboardPage() {
    return <DashboardContent />;
}