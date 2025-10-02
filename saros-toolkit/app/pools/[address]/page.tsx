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
        if (!connected || !wallet || !wallet.publicKey) return null;
        const provider = new AnchorProvider(connection, wallet as any, AnchorProvider.defaultOptions());
        setProvider(provider);
        return new LiquidityBookServices({ mode: MODE.DEVNET });
    }, [connected, connection, wallet]);

    const handleBackToPools = () => {
        router.push('/pools');
    };

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
                    <a href="/pools" className="flex items-center gap-2 text-foreground transition-colors hover:text-foreground/80">
                        <Waves className="h-4 w-4" />
                        Pools
                    </a>
                    <a href="/positions" className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
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
                    <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed">
                        <p className="text-muted-foreground">Please connect your wallet to view pool details.</p>
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