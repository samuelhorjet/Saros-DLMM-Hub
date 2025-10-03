"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
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
import { RefreshCw, PlusCircle, Search, Zap, Scan, Bot, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Interfaces (Unchanged)
export interface EnrichedPositionData {
  key: string;
  position: PositionInfo;
  poolDetails: any;
  baseToken: TokenInfo;
  quoteToken: TokenInfo;
  poolAddress: string;
}
type PositionFilter = "all" | "active" | "inactive" | "empty";
type SortOption = "desc" | "asc";
type ScanMode = "fast" | "withLiquidity" | "withoutLiquidity" | "full";

const PositionsPageContent = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey } = wallet;
  const router = useRouter();

  // State Management
  const [allEnrichedPositions, setAllEnrichedPositions] = useState<EnrichedPositionData[]>([]);
  const [statusMessage, setStatusMessage] = useState("Connect your wallet to begin.");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<ScanMode | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  
  // UI State (Unchanged)
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("desc");
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [isRebalanceModalOpen, setIsRebalanceModalOpen] = useState(false);
  const [isBurnModalOpen, setIsBurnModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<EnrichedPositionData | null>(null);

  const sdk = useMemo(() => {
    if (!wallet || !publicKey) return null;
    const provider = new AnchorProvider(connection, wallet as any, AnchorProvider.defaultOptions());
    setProvider(provider);
    const sdkInstance = new LiquidityBookServices({ mode: MODE.DEVNET });
    sdkInstance.connection = connection;
    return sdkInstance;
  }, [connection, wallet, publicKey]);

  // --- NEW CORE SCANNING LOGIC ---
  const startScan = useCallback(async (mode: ScanMode) => {
    if (!sdk || !publicKey) return;

    setIsLoading(true);
    setLoadingMode(mode);
    setEta(null);
    setStatusMessage(`Starting ${mode} scan...`);

    let finalFailedPools: string[] = [];
    let foundPositions: EnrichedPositionData[] = [];

    try {
      if (mode === 'fast') {
        setStatusMessage("Searching for positions you've recently viewed...");
        const cachedPositions: EnrichedPositionData[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith(`cached_positions_`) && key.endsWith(publicKey.toBase58())) {
                const item = sessionStorage.getItem(key);
                if (item) {
                  // This part is complex, as it requires re-enriching or assuming structure.
                  // For a true fast scan, we'd need to cache the *enriched* data per pool.
                  // This is a placeholder for that logic.
                }
            }
        }
        // For now, let's assume a simplified fast scan based on the main cache
        const mainCacheKey = `cachedEnrichedPositions_${publicKey.toBase58()}`;
        const cachedData = sessionStorage.getItem(mainCacheKey);
        if (cachedData) foundPositions = JSON.parse(cachedData);
        setStatusMessage(`Fast scan complete. Found ${foundPositions.length} cached positions.`);

      } else {
        // This logic is for 'withLiquidity', 'withoutLiquidity', and 'full' scans
        const cachedPoolsJSON = sessionStorage.getItem("cachedPools");
        if (!cachedPoolsJSON) {
          setStatusMessage("Pool list not found. Please visit the Pools page first.");
          setIsLoading(false);
          setLoadingMode(null);
          return;
        }
        const allPools: any[] = JSON.parse(cachedPoolsJSON);
        let poolsToScan: any[] = [];

        if (mode === 'withLiquidity') {
          poolsToScan = allPools.filter(p => p.liquidity > 1);
        } else if (mode === 'withoutLiquidity') {
          poolsToScan = allPools.filter(p => p.liquidity <= 1);
        } else { // 'full'
          poolsToScan = allPools;
        }

        if (poolsToScan.length === 0) {
            setStatusMessage(`No pools found for the '${mode}' scan criteria.`);
        } else {
            const scanResults = await executePositionScan(poolsToScan);
            foundPositions = scanResults.enrichedPositions;
            finalFailedPools = scanResults.failedPools;
        }
      }

      // Merge results without duplicates
      setAllEnrichedPositions(prevPositions => {
        const positionMap = new Map(prevPositions.map(p => [p.key, p]));
        foundPositions.forEach(p => positionMap.set(p.key, p));
        return Array.from(positionMap.values());
      });

      // Save the combined results to the main cache
      const positionMap = new Map(allEnrichedPositions.map(p => [p.key, p]));
      foundPositions.forEach(p => positionMap.set(p.key, p));
      sessionStorage.setItem(`cachedEnrichedPositions_${publicKey.toBase58()}`, JSON.stringify(Array.from(positionMap.values())));
      
      if(finalFailedPools.length > 0) {
        setStatusMessage(`Scan complete. Found ${foundPositions.length} new positions. Failed to check ${finalFailedPools.length} pools.`);
      } else if (mode !== 'fast') {
        setStatusMessage(`Scan complete. Found ${foundPositions.length} new positions.`);
      }

    } catch (err) {
      console.error(`Error during ${mode} scan:`, err);
      setStatusMessage("An error occurred. Check the console for details.");
    } finally {
      setIsLoading(false);
      setLoadingMode(null);
      setEta(null);
    }
  }, [sdk, publicKey, allEnrichedPositions]);

  // --- HELPER FUNCTION FOR EXECUTING THE SCAN ---
  const executePositionScan = async (poolsToScan: any[]) => {
    if (!sdk || !publicKey) return { enrichedPositions: [], failedPools: [] };

    const startTime = Date.now();
    const totalPools = poolsToScan.length;
    const BATCH_SIZE = 5; // A reasonable size for a good RPC
    const finalFailedPools: string[] = [];
    let allFoundPositions: { positionInfo: PositionInfo; poolAddress: string; }[] = [];

    for (let i = 0; i < totalPools; i += BATCH_SIZE) {
        const batch = poolsToScan.slice(i, i + BATCH_SIZE);
        const processedCount = Math.min(i + BATCH_SIZE, totalPools);
        
        setStatusMessage(`Scanning pools ${i + 1}–${processedCount} of ${totalPools}...`);

        const elapsedTime = Date.now() - startTime;
        if (processedCount > 0) {
            const avgTimePerBatch = elapsedTime / (i / BATCH_SIZE + 1);
            const remainingBatches = Math.ceil((totalPools - processedCount) / BATCH_SIZE);
            const etaMs = remainingBatches * avgTimePerBatch;
            const etaSeconds = Math.round(etaMs / 1000);
            const minutes = Math.floor(etaSeconds / 60);
            const seconds = etaSeconds % 60;
            setEta(`Est. time remaining: ${minutes}m ${seconds}s`);
        }

        const batchPromises = batch.map(pool => fetchPositionsWithRetry(pool.address, finalFailedPools));
        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                allFoundPositions.push(...result.value);
            }
        });
    }

    if (allFoundPositions.length === 0) {
        return { enrichedPositions: [], failedPools: finalFailedPools };
    }

    setStatusMessage(`Found ${allFoundPositions.length} raw position(s). Fetching details...`);
    setEta(null);

    // Parallel Enrichment
    const enrichmentPromises = allFoundPositions.map(async ({ positionInfo, poolAddress }) => {
        try {
            const pairAccount = await sdk.getPairAccount(new PublicKey(poolAddress));
            const [baseToken, quoteToken] = await Promise.all([
                getTokenInfo(pairAccount.tokenMintX.toString()),
                getTokenInfo(pairAccount.tokenMintY.toString()),
            ]);
            return {
                key: positionInfo.positionMint,
                position: positionInfo,
                poolDetails: pairAccount,
                baseToken,
                quoteToken,
                poolAddress,
            };
        } catch (e) {
            console.error(`Failed to enrich position ${positionInfo.positionMint}`, e);
            return null;
        }
    });

    const settledResults = await Promise.allSettled(enrichmentPromises);
    const enrichedPositions: EnrichedPositionData[] = [];
    settledResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
            enrichedPositions.push(result.value);
        }
    });
    
    return { enrichedPositions, failedPools: finalFailedPools };
  };

  // --- HELPER WITH RETRY LOGIC (RESTORED) ---
  const fetchPositionsWithRetry = async (poolAddress: string, failedPools: string[]) => {
    if (!sdk || !publicKey) return [];
    
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2500;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const userPositions = await sdk.getUserPositions({
                payer: publicKey,
                pair: new PublicKey(poolAddress),
            });
            if (!userPositions || userPositions.length === 0) return [];
            return userPositions.map((p) => ({
                positionInfo: p,
                poolAddress: poolAddress,
            }));
        } catch (error: any) {
            if (attempt === MAX_RETRIES || !error.message?.includes("429")) {
                console.error(`Failed to fetch from pool ${poolAddress} after ${attempt} attempts.`, error.message);
                failedPools.push(poolAddress);
                return null;
            }
            console.warn(`Rate limited on pool ${poolAddress}. Retrying... (Attempt ${attempt})`);
            await new Promise((res) => setTimeout(res, RETRY_DELAY * attempt)); // Exponential backoff
        }
    }
    return null;
  };

  // --- Initial Load Effect ---
  useEffect(() => {
    if (sdk && publicKey) {
      setStatusMessage("Ready. Choose a scan method to find your positions.");
      startScan('fast'); // Automatically run the fast scan on load
    }
  }, [sdk, publicKey]);

  // Unchanged utility functions and memoized calculations
  const handleSelectPosition = (positionData: EnrichedPositionData) => {
    sessionStorage.setItem(`position_details_${positionData.key}`, JSON.stringify(positionData));
    router.push(`/positions/${positionData.key}`);
  };
  const handleRefreshAndCloseModals = () => {
    setIsRemoveModalOpen(false);
    setIsRebalanceModalOpen(false);
    setIsBurnModalOpen(false);
    startScan('fast'); // A fast refresh is usually enough after a transaction
  };
  const openModal = (type: "remove" | "rebalance" | "burn", position: EnrichedPositionData) => {
    setSelectedPosition(position);
    if (type === "remove") setIsRemoveModalOpen(true);
    if (type === "rebalance") setIsRebalanceModalOpen(true);
    if (type === "burn") setIsBurnModalOpen(true);
  };
  const processedPositions = useMemo(() => {
    // ... (This logic is unchanged)
    const lowerSearch = searchTerm.toLowerCase();
    let filtered = allEnrichedPositions
      .filter((p) => {
        const pairSymbol = `${p.baseToken.symbol}/${p.quoteToken.symbol}`.toLowerCase();
        return pairSymbol.includes(lowerSearch) || p.poolAddress.toLowerCase().includes(lowerSearch);
      })
      .filter((p) => {
        const totalLiquidity = p.position.liquidityShares.reduce((acc, current) => acc + BigInt(current), BigInt(0));
        if (positionFilter === "empty") return totalLiquidity === BigInt(0);
        const isActive = p.poolDetails.activeId >= p.position.lowerBinId && p.poolDetails.activeId <= p.position.upperBinId;
        if (positionFilter === "active") return totalLiquidity > BigInt(0) && isActive;
        if (positionFilter === "inactive") return totalLiquidity > BigInt(0) && !isActive;
        return true;
      });
    filtered.sort((a, b) => {
      const liqA = a.position.liquidityShares.reduce((acc, val) => acc + BigInt(val), BigInt(0));
      const liqB = b.position.liquidityShares.reduce((acc, val) => acc + BigInt(val), BigInt(0));
      if (sortOption === "desc") { return liqB > liqA ? 1 : -1; } 
      else { return liqA > liqB ? 1 : -1; }
    });
    return filtered;
  }, [allEnrichedPositions, positionFilter, searchTerm, sortOption]);

  const renderLoadingState = () => (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}
    </div>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-4 text-center">
          <p className="text-muted-foreground">{statusMessage}</p>
          {eta && <p className="text-sm font-bold">{eta}</p>}
          {renderLoadingState()}
        </div>
      );
    }
    if (processedPositions.length > 0) {
      return (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {processedPositions.map((data) => (
            <PositionCard key={data.key} enrichedData={data} onRemove={() => openModal("remove", data)} onRebalance={() => openModal("rebalance", data)} onSelect={() => handleSelectPosition(data)} onBurn={() => openModal("burn", data)} />
          ))}
        </div>
      );
    }
    return (
      <Card className="py-10 text-center">
        <CardHeader>
          <CardTitle>No Positions Found</CardTitle>
          <CardDescription>{statusMessage}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Try using one of the scan methods above to find your positions.</p>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="animate-slide-up space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">My Positions</h2>
          <p className="text-muted-foreground">Scan the blockchain to find and manage your liquidity positions.</p>
        </div>

        {/* --- NEW SCANNING UI --- */}
        <Card className="animate-slide-up">
          <CardHeader>
            <CardTitle>Scan for Positions</CardTitle>
            <CardDescription>Choose a method to find your positions. Start with a fast scan.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Button onClick={() => startScan('fast')} disabled={isLoading} variant="outline">
              <History className={`h-4 w-4 mr-2 ${loadingMode === 'fast' ? 'animate-spin' : ''}`} /> Fast Scan
              <span className="text-xs text-muted-foreground ml-2">(Cached)</span>
            </Button>
            <Button onClick={() => startScan('withLiquidity')} disabled={isLoading}>
              <Zap className={`h-4 w-4 mr-2 ${loadingMode === 'withLiquidity' ? 'animate-spin' : ''}`} /> Scan Active Pools
              <span className="text-xs text-muted-foreground ml-2">(~1 min)</span>
            </Button>
            <Button onClick={() => startScan('withoutLiquidity')} disabled={isLoading} variant="secondary">
              <Bot className={`h-4 w-4 mr-2 ${loadingMode === 'withoutLiquidity' ? 'animate-spin' : ''}`} /> Scan Inactive Pools
              <span className="text-xs text-muted-foreground ml-2">(Slow)</span>
            </Button>
            <Button onClick={() => startScan('full')} disabled={isLoading} variant="destructive">
              <Scan className={`h-4 w-4 mr-2 ${loadingMode === 'full' ? 'animate-spin' : ''}`} /> Full Rescan
               <span className="text-xs text-muted-foreground ml-2">(Very Slow)</span>
            </Button>
          </CardContent>
        </Card>

        {/* --- FILTER & SEARCH UI (Unchanged) --- */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input placeholder="Filter found positions..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Select value={positionFilter} onValueChange={(v) => setPositionFilter(v as PositionFilter)}>
              <SelectTrigger className="w-full md:w-[150px]"><SelectValue placeholder="Filter..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Positions</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Out of Range</SelectItem>
                <SelectItem value="empty">Empty</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
              <SelectTrigger className="w-full md:w-[240px]"><SelectValue placeholder="Sort by..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Sort by Liquidity: High to Low</SelectItem>
                <SelectItem value="asc">Sort by Liquidity: Low to High</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => router.push("/pools")} className="w-full md:w-auto">
              <PlusCircle className="h-4 w-4 mr-2" /> Add Liquidity
            </Button>
          </div>
        </div>

        <div className="mt-4">{renderContent()}</div>

        {/* Modals (Unchanged) */}
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

export default function AllPositionsPage() {
  return <PositionsPageContent />;
}