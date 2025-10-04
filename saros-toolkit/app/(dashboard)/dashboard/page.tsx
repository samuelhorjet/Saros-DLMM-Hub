// src/app/dashboard/page.tsx
"use client";
import React, { useMemo } from "react";
import { LiquidityBookServices, MODE } from "@saros-finance/dlmm-sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, setProvider } from "@coral-xyz/anchor";
import { Dashboard } from "@/components/Dashboard";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { connected } = wallet;
  const router = useRouter();

  const sdk = useMemo(() => {
    if (!connected || !wallet.publicKey) return null;
    try {
      const provider = new AnchorProvider(
        connection,
        wallet as any,
        AnchorProvider.defaultOptions()
      );
      setProvider(provider);
      const sdkInstance = new LiquidityBookServices({ mode: MODE.DEVNET });
      sdkInstance.connection = connection; // ✅ force SDK to use your RPC
      return sdkInstance;
    } catch (error) {
      console.error("Error initializing SDK:", error);
      return null;
    }
  }, [connected, connection, wallet]);

  const handleNavigation = (section: "pools" | "positions") => {
    router.push(`/${section}`);
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        {!sdk ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-muted-foreground">Initializing Dashboard...</p>
          </div>
        ) : (
          <Dashboard sdk={sdk} onNavigate={handleNavigation} />
        )}
      </main>
    </div>
  );
}