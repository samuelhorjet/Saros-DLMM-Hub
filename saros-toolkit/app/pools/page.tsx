"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { LiquidityBookServices, MODE } from "@saros-finance/dlmm-sdk";
import { PoolList } from "@/components/PoolList";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { getTokenInfo } from "@/utils/token";
import { AnchorProvider, setProvider } from "@coral-xyz/anchor";
import { useRouter } from "next/navigation";
import { getPriceFromId } from "@saros-finance/dlmm-sdk/utils/price";
import { LayoutDashboard, Waves, FolderKanban, Layers } from "lucide-react";

const PoolsPageContent = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { connected } = wallet;
  const router = useRouter();

  const [pools, setPools] = useState<any[]>([]);
  const [loadingText, setLoadingText] = useState(
    "Please connect your wallet..."
  );

  const sdk = useMemo(() => {
    if (!connected || !wallet || !wallet.publicKey) return null;
    const provider = new AnchorProvider(
      connection,
      wallet as any,
      AnchorProvider.defaultOptions()
    );
    setProvider(provider);
    const sdkInstance = new LiquidityBookServices({ mode: MODE.DEVNET });
    sdkInstance.connection = connection;
    return sdkInstance;
  }, [connected, connection, wallet]);

  const fetchAndFilterPools = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!sdk) return;
      try {
        if (!forceRefresh && typeof window !== "undefined") {
          const cachedPools = sessionStorage.getItem("cachedPools");
          if (cachedPools) {
            setPools(JSON.parse(cachedPools));
            setLoadingText("");
            return;
          }
        }

        setLoadingText("Fetching all available pool addresses...");
        const allPoolAddresses = await sdk.fetchPoolAddresses();
        const uniquePoolAddresses = [...new Set(allPoolAddresses)];

        let allFetchedPools: any[] = [];
        const BATCH_SIZE = 10;
        const startTime = Date.now();

        for (let i = 0; i < uniquePoolAddresses.length; i += BATCH_SIZE) {
          const batchAddresses = uniquePoolAddresses.slice(i, i + BATCH_SIZE);
          const poolsProcessed = i + batchAddresses.length;
          let estimatedTimeString = "";

          // Calculate and show estimate only after the first batch for better accuracy
          if (i > 0) {
            const elapsedTime = Date.now() - startTime; // in milliseconds
            const avgTimePerPool = elapsedTime / i; // 'i' is the number of pools *completed* before this batch
            const poolsRemaining = uniquePoolAddresses.length - i;
            const estimatedMs = Math.round(poolsRemaining * avgTimePerPool);

            if (isFinite(estimatedMs) && estimatedMs > 0) {
              const totalSeconds = Math.floor(estimatedMs / 1000);
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = totalSeconds % 60;

              if (minutes > 0) {
                estimatedTimeString = ` (est. ${minutes}m ${seconds}s remaining)`;
              } else {
                estimatedTimeString = ` (est. ${seconds}s remaining)`;
              }
            }
          }

          setLoadingText(
            `Fetching pool details... (${poolsProcessed}/${uniquePoolAddresses.length})${estimatedTimeString}`
          );

          const batchPromises = batchAddresses.map(async (address) => {
            try {
              const [metadata, pairAccount] = await Promise.all([
                sdk.fetchPoolMetadata(address) as any,
                sdk.getPairAccount(new PublicKey(address)),
              ]);

              if (!metadata || !pairAccount) return null;

              const baseTokenInfo = await getTokenInfo(metadata.baseMint);
              const quoteTokenInfo = await getTokenInfo(metadata.quoteMint);

              const { activeId, binStep } = pairAccount;
              const price = getPriceFromId(
                binStep,
                activeId,
                baseTokenInfo.decimals,
                quoteTokenInfo.decimals
              );

              return {
                address,
                baseSymbol: baseTokenInfo.symbol,
                quoteSymbol: quoteTokenInfo.symbol,
                baseLogoURI: baseTokenInfo.logoURI,
                quoteLogoURI: quoteTokenInfo.logoURI,
                price: isNaN(price) ? 0 : price,
                liquidity:
                  Number(metadata.baseReserve || 0) +
                  Number(metadata.quoteReserve || 0),
              };
            } catch (e) {
              console.error(`Failed to process pool ${address}:`, e);
              return null;
            }
          });

          const batchResults = await Promise.all(batchPromises);
          allFetchedPools.push(
            ...batchResults.filter((p): p is any => p !== null)
          );
          setPools([...allFetchedPools]);
        }

        if (typeof window !== "undefined") {
          sessionStorage.setItem(
            "cachedPools",
            JSON.stringify(allFetchedPools)
          );
        }
      } catch (err) {
        console.error("Failed to fetch pools:", err);
        setLoadingText(
          "An error occurred while fetching pools. Please try refreshing."
        );
      } finally {
        setLoadingText("");
      }
    },
    [sdk]
  );

  const handleRefresh = async () => {
    setLoadingText("Refreshing pool list...");
    setPools([]);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("cachedPools");
    }
    await fetchAndFilterPools(true);
  };

  useEffect(() => {
    if (connected && sdk) {
      fetchAndFilterPools();
    } else if (!connected) {
      setLoadingText("Please connect your wallet...");
      setPools([]);
    }
  }, [connected, sdk, fetchAndFilterPools]);

  const handlePoolSelect = (address: string) => {
    router.push(`/pools/${address}`);
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
        <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
          <a
            href="/dashboard"
            className="flex items-center gap-2 font-bold text-foreground"
          >
            <Layers className="h-6 w-6" />
            <span>Saros DLMM</span>
          </a>
          <a
            href="/dashboard"
            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </a>
          <a
            href="/pools"
            className="flex items-center gap-2 text-foreground transition-colors hover:text-foreground/80"
          >
            <Waves className="h-4 w-4" />
            Pools
          </a>
          <a
            href="/positions"
            className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
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
        <div className="animate-slide-up">
          <h2 className="text-3xl font-bold tracking-tight">Liquidity Pools</h2>
          <p className="text-muted-foreground">
            Discover, manage, and create new DLMM liquidity pools.
          </p>
        </div>

        {!connected ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed">
            <p className="text-muted-foreground">
              Please connect your wallet to view pools.
            </p>
          </div>
        ) : sdk ? (
          <PoolList
            pools={pools}
            onPoolSelect={handlePoolSelect}
            sdk={sdk}
            onRefresh={handleRefresh}
            loading={!!loadingText}
            loadingText={loadingText}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-muted-foreground">Initializing SDK...</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default function PoolsPage() {
  return <PoolsPageContent />;
}
