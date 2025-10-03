// src/app/pools/[address]/page.tsx
"use client";
import React, { useMemo } from "react";
import { LiquidityBookServices, MODE } from "@saros-finance/dlmm-sdk";
import { PoolDetails } from "@/components/PoolDetails";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider, setProvider } from "@coral-xyz/anchor";
import { useParams, useRouter } from "next/navigation";
import { LayoutDashboard, Waves, FolderKanban, Layers } from "lucide-react";

const PoolDetailsPageContent = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const router = useRouter();
  const params = useParams();

  const poolAddress = params.address as string;

  const sdk = useMemo(() => {
    if (!connected || !wallet) return null;
    const provider = new AnchorProvider(
      connection,
      wallet as any,
      AnchorProvider.defaultOptions()
    );
    setProvider(provider);
    const sdkInstance = new LiquidityBookServices({ mode: MODE.DEVNET });
    sdkInstance.connection = connection; // ✅ force it to use your RPC
    return sdkInstance;
  }, [connected, connection, wallet]);

  const handleBackToPools = () => {
    router.push("/pools");
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        {!connected || !sdk || !publicKey ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed">
            <p className="text-muted-foreground">
              Please connect your wallet to view pool details.
            </p>
          </div>
        ) : (
          <PoolDetails
            sdk={sdk}
            poolAddress={poolAddress}
            userPublicKey={publicKey}
            onBack={handleBackToPools}
          />
        )}
      </main>
    </div>
  );
};

export default function PoolDetailsPage() {
  return <PoolDetailsPageContent />;
}
