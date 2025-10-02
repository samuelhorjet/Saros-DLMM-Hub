// src/app/positions/page.tsx
"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider, setProvider } from "@coral-xyz/anchor";
import { LiquidityBookServices, MODE } from "@saros-finance/dlmm-sdk";
import { PublicKey } from "@solana/web3.js";
import { getTokenInfo, TokenInfo } from "@/utils/token";
import { PositionCard } from "@/components/PositionCard";
import { PositionInfo } from "@saros-finance/dlmm-sdk/types/services";
import { RemoveLiquidityModal } from "@/components/modals/RemoveLiquidityModal";
import { RebalanceModal } from "@/components/modals/RebalanceModal";
import { useRouter } from "next/navigation";
import { BurnPositionModal } from "@/components/modals/BurnPositionModal";
import { LayoutDashboard, Waves, FolderKanban, Layers, RefreshCw, PlusCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export interface EnrichedPositionData {
  key: string;
  position: PositionInfo;
  poolDetails: any;
  baseToken: TokenInfo;
  quoteToken: TokenInfo;
  poolAddress: string;
}
type PositionFilter = "all" | "active" | "inactive" | "empty";

const PositionsPageContent = () => {
    const { connection } = useConnection();
    const wallet = useWallet();
    const { publicKey, connected } = wallet;
    const router = useRouter();

    const [allEnrichedPositions, setAllEnrichedPositions] = useState<EnrichedPositionData[]>([]);
    const [statusMessage, setStatusMessage] = useState("Please connect your wallet...");
    const [isLoading, setIsLoading] = useState(false);

    const [eta, setEta] = useState<string | null>(null);

    const [positionFilter, setPositionFilter] = useState<PositionFilter>("all");
    const [searchTerm, setSearchTerm] = useState("");
    
    const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
    const [isRebalanceModalOpen, setIsRebalanceModalOpen] = useState(false);
    const [isBurnModalOpen, setIsBurnModalOpen] = useState(false);
    const [selectedPosition, setSelectedPosition] = useState<EnrichedPositionData | null>(null);
    
    const sdk = useMemo(() => {
        if (!connected || !wallet) return null;
        const provider = new AnchorProvider(connection, wallet as any, AnchorProvider.defaultOptions());
        setProvider(provider);
        return new LiquidityBookServices({ mode: MODE.DEVNET });
    }, [connected, connection, wallet]);
    
    const handleSelectPosition = (positionData: EnrichedPositionData) => {
        sessionStorage.setItem(`position_details_${positionData.key}`, JSON.stringify(positionData));
        router.push(`/positions/${positionData.key}`);
    };

   const fetchAllUserPositions = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!sdk || !publicKey) return;
      const CACHE_KEY = `cachedEnrichedPositions_${publicKey.toBase58()}`;
      setIsLoading(true);
      setEta(null);
      if (!forceRefresh) {
        const cachedData = sessionStorage.getItem(CACHE_KEY);
        if (cachedData) {
          try {
            const parsedData = JSON.parse(cachedData);
            if (Array.isArray(parsedData) && parsedData.every(p => p.poolAddress && p.baseToken)) {
              setStatusMessage("Loaded positions from cache.");
              setAllEnrichedPositions(parsedData);
              setIsLoading(false);
              return;
            }
             console.warn("Cached data has incorrect structure, refetching...");
             sessionStorage.removeItem(CACHE_KEY);
          } catch(e) {
            console.error("Failed to parse cached positions, refetching...", e);
            sessionStorage.removeItem(CACHE_KEY);
          }
        }
      } else {
        sessionStorage.removeItem(CACHE_KEY);
      }
      setAllEnrichedPositions([]);
      let finalFailedPools: string[] = [];
      try {
        const startTime = Date.now();
        let allPools: any[] = [];
        const cachedPools = sessionStorage.getItem("cachedPools");
        if (cachedPools) {
          allPools = JSON.parse(cachedPools);
          setStatusMessage(`Found ${allPools.length} cached pools. Checking for positions...`);
        } else {
          setStatusMessage("No cached pools found. Please visit the Pools page first to load available pools.");
          setIsLoading(false);
          return;
        }
        const totalPools = allPools.length;
        const BATCH_SIZE = 5;
        const DELAY_BETWEEN_BATCHES = 2000;
        let allFoundPositions: { positionInfo: PositionInfo; poolAddress: string }[] = [];
        const fetchPositionsWithRetry = async (pool: any) => {
          const MAX_RETRIES = 3;
          const RETRY_DELAY = 2500;
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
              const userPositions = await sdk.getUserPositions({ payer: publicKey, pair: new PublicKey(pool.address) });
              if (!userPositions || userPositions.length === 0) return [];
              return userPositions.map((p) => ({ positionInfo: p, poolAddress: pool.address }));
            } catch (error: any) {
              if (!error.message?.includes("429") || attempt === MAX_RETRIES) {
                console.error(`Failed to fetch positions for pool ${pool.address} after ${attempt} attempt(s).`, error.message);
                finalFailedPools.push(pool.address);
                return null;
              }
              console.warn(`Rate limited on pool ${pool.address}. Retrying in ${RETRY_DELAY / 1000}s... (Attempt ${attempt}/${MAX_RETRIES})`);
              await new Promise(res => setTimeout(res, RETRY_DELAY));
            }
          }
          return null;
        };
        for (let i = 0; i < totalPools; i += BATCH_SIZE) {
          const batch = allPools.slice(i, i + BATCH_SIZE);
          const processedCount = i + batch.length;
          const batchNumber = i / BATCH_SIZE + 1;
          setStatusMessage(`Fetching Batch ${batchNumber} (Pools ${i + 1}–${processedCount} of ${totalPools})...`);
          const elapsedTime = Date.now() - startTime;
          const avgTimePerPool = elapsedTime / processedCount;
          const remainingPools = totalPools - processedCount;
          const etaMs = remainingPools * avgTimePerPool;
          const etaSeconds = Math.round(etaMs / 1000);
          const minutes = Math.floor(etaSeconds / 60);
          const seconds = etaSeconds % 60;
          setEta(`Est. time remaining: ${minutes}m ${seconds}s`);
          const batchResults = await Promise.all(batch.map(pool => fetchPositionsWithRetry(pool)));
          batchResults.forEach(result => {
            if (result !== null) {
              allFoundPositions.push(...result);
            }
          });
          if (processedCount < totalPools) {
            await new Promise((res) => setTimeout(res, DELAY_BETWEEN_BATCHES));
          }
        }
        setEta(null);
        if (allFoundPositions.length === 0) {
          if (finalFailedPools.length > 0) {
             setStatusMessage(`Scan complete. Failed to fetch data for ${finalFailedPools.length} pool(s) and no positions found in other pools.`);
          } else {
            setStatusMessage("Scan complete. No liquidity positions found across any pools.");
          }
          setIsLoading(false);
          return;
        }
        setStatusMessage(`Found ${allFoundPositions.length} position(s). Fetching details...`);
        const finalData: EnrichedPositionData[] = [];
        const poolDetailsCache = new Map<string, any>();
        for (const { positionInfo, poolAddress } of allFoundPositions) {
          try {
            let pairAccount = poolDetailsCache.get(poolAddress);
            if (!pairAccount) {
              pairAccount = await sdk.getPairAccount(new PublicKey(poolAddress));
              poolDetailsCache.set(poolAddress, pairAccount);
            }
            const [baseToken, quoteToken] = await Promise.all([
              getTokenInfo(pairAccount.tokenMintX.toString()),
              getTokenInfo(pairAccount.tokenMintY.toString()),
            ]);
            finalData.push({
              key: positionInfo.positionMint,
              position: positionInfo,
              poolDetails: pairAccount,
              baseToken,
              quoteToken,
              poolAddress: poolAddress,
            });
          } catch (e) {
            console.error(`Failed to enrich position ${positionInfo.positionMint}:`, e);
          }
        }
        setAllEnrichedPositions(finalData);
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(finalData));
        if (finalFailedPools.length > 0) {
            setStatusMessage(`Scan complete. Failed to fetch data for ${finalFailedPools.length} pool(s). Results may be incomplete.`);
        } else {
            setStatusMessage("");
        }
      } catch (err) {
        console.error("A critical error occurred during the fetch process:", err);
        setStatusMessage("An error occurred. Check console for details.");
      } finally {
        setIsLoading(false);
        setEta(null);
      }
    },
    [sdk, publicKey]
  );

    useEffect(() => {
        if (connected && sdk) {
            fetchAllUserPositions();
        }
    }, [connected, sdk, fetchAllUserPositions]);

    const handleRefreshAndCloseModals = () => {
        setIsRemoveModalOpen(false);
        setIsRebalanceModalOpen(false);
        setIsBurnModalOpen(false);
        fetchAllUserPositions(true);
    };
    
    const openModal = (type: 'remove' | 'rebalance' | 'burn', position: EnrichedPositionData) => {
        setSelectedPosition(position);
        if (type === 'remove') setIsRemoveModalOpen(true);
        if (type === 'rebalance') setIsRebalanceModalOpen(true);
        if (type === 'burn') setIsBurnModalOpen(true);
    };

    const processedPositions = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase();
        return allEnrichedPositions
            .filter(p => {
                const pairSymbol = `${p.baseToken.symbol}/${p.quoteToken.symbol}`.toLowerCase();
                return pairSymbol.includes(lowerSearch) || p.poolAddress.toLowerCase().includes(lowerSearch);
            })
            .filter(p => {
                const totalLiquidity = p.position.liquidityShares.reduce((acc, current) => acc + BigInt(current), BigInt(0));
                if (positionFilter === 'empty') return totalLiquidity === BigInt(0);
                const isActive = p.poolDetails.activeId >= p.position.lowerBinId && p.poolDetails.activeId <= p.position.upperBinId;
                if (positionFilter === 'active') return totalLiquidity > BigInt(0) && isActive;
                if (positionFilter === 'inactive') return totalLiquidity > BigInt(0) && !isActive;
                return true;
            });
    }, [allEnrichedPositions, positionFilter, searchTerm]);

    const renderLoadingState = () => (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}
        </div>
    );

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
                <a href="/positions" className="flex items-center gap-2 text-foreground transition-colors hover:text-foreground/80">
                    <FolderKanban className="h-4 w-4" />
                    My Positions
                </a>
            </nav>
            <div className="ml-auto flex items-center gap-4">
                <WalletMultiButton />
            </div>
        </header>

        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
            <div className="animate-slide-up space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">My Positions</h2>
                <p className="text-muted-foreground">An overview of all your liquidity positions across all pools.</p>
            </div>

             <div className="flex flex-col gap-4 md:flex-row">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input placeholder="Search by symbol or pool address..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                    <Select value={positionFilter} onValueChange={v => setPositionFilter(v as PositionFilter)}>
                        <SelectTrigger className="w-full md:w-[150px]">
                            <SelectValue placeholder="Filter..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Positions</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Out of Range</SelectItem>
                            <SelectItem value="empty">Empty</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" onClick={() => fetchAllUserPositions(true)} disabled={isLoading}>
                        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button onClick={() => router.push('/pools')} className="w-full md:w-auto">
                        <PlusCircle className="h-4 w-4 mr-2" /> Add Liquidity
                    </Button>
                </div>
            </div>

            {isLoading ? renderLoadingState() :
             !connected || !sdk ? <p className="text-center text-muted-foreground py-10">Please connect your wallet.</p> :
             allEnrichedPositions.length === 0 ? <p className="text-center text-muted-foreground py-10">{statusMessage || "No positions found."}</p> :
             processedPositions.length > 0 ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {processedPositions.map((data) => (
                        <PositionCard
                            key={data.key}
                            enrichedData={data}
                            onRemove={() => openModal('remove', data)}
                            onRebalance={() => openModal('rebalance', data)}
                            onSelect={() => handleSelectPosition(data)}
                            onBurn={() => openModal('burn', data)}
                        />
                    ))}
                </div>
            ) : <p className="text-center text-muted-foreground py-10">No positions match your filters.</p>
            }

            {sdk && (
                <>
                    <RemoveLiquidityModal isOpen={isRemoveModalOpen} onClose={() => setIsRemoveModalOpen(false)} sdk={sdk} positionToRemove={selectedPosition} onSuccess={handleRefreshAndCloseModals} />
                    <RebalanceModal isOpen={isRebalanceModalOpen} onClose={() => setIsRebalanceModalOpen(false)} sdk={sdk} positionToRebalance={selectedPosition} onSuccess={handleRefreshAndCloseModals} />
                    <BurnPositionModal isOpen={isBurnModalOpen} onClose={() => setIsBurnModalOpen(false)} sdk={sdk} positionToBurn={selectedPosition} onSuccess={handleRefreshAndCloseModals} />
                </>
            )}
        </main>
    </div>
    );
};

function AllPositionsPage() {
  return <PositionsPageContent />;
}

export default AllPositionsPage;