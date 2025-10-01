"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
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

const WalletProvider = dynamic(() => import("@/components/walletContextProvider").then((mod) => mod.WalletContextProvider), { ssr: false });

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
    const [eta, setEta] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    const [positionFilter, setPositionFilter] = useState<PositionFilter>("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [sortOption, setSortOption] = useState<'desc' | 'asc'>('desc');
    
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

    const handleRefreshAndCloseModals = () => {
        setIsRemoveModalOpen(false);
        setIsRebalanceModalOpen(false);
        setIsBurnModalOpen(false);
        fetchAllUserPositions(true);
    };

    const handleOpenRemoveModal = (position: EnrichedPositionData) => {
        setSelectedPosition(position);
        setIsRemoveModalOpen(true);
    };

    const handleOpenRebalanceModal = (position: EnrichedPositionData) => {
        setSelectedPosition(position);
        setIsRebalanceModalOpen(true);
    };

    const handleOpenBurnModal = (position: EnrichedPositionData) => {
        setSelectedPosition(position);
        setIsBurnModalOpen(true);
    };
    
    const processedPositions = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase();
        let filtered = allEnrichedPositions.filter(p => {
            const pairSymbol = p.baseToken?.symbol && p.quoteToken?.symbol ? `${p.baseToken.symbol}/${p.quoteToken.symbol}`.toLowerCase() : '';
            const poolAddr = p.poolAddress?.toLowerCase() || '';
            return pairSymbol.includes(lowerSearch) || poolAddr.includes(lowerSearch);
        });

        filtered = filtered.filter(p => {
          const totalLiquidity = p.position.liquidityShares.reduce((acc, current) => acc + BigInt(current), BigInt(0));
          if (positionFilter === 'empty') return totalLiquidity === BigInt(0);
          const isActive = p.poolDetails.activeId >= p.position.lowerBinId && p.poolDetails.activeId <= p.position.upperBinId;
          if (positionFilter === 'active') return totalLiquidity > BigInt(0) && isActive;
          if (positionFilter === 'inactive') return totalLiquidity > BigInt(0) && !isActive;
          return true;
        });

        filtered.sort((a, b) => {
            const liqA = a.position.liquidityShares.reduce((acc, val) => acc + BigInt(val), BigInt(0));
            const liqB = b.position.liquidityShares.reduce((acc, val) => acc + BigInt(val), BigInt(0));
            if (sortOption === 'desc') {
                return liqB > liqA ? 1 : -1;
            } else {
                return liqA > liqB ? 1 : -1;
            }
        });
        
        return filtered;
    }, [allEnrichedPositions, positionFilter, searchTerm, sortOption]);

    useEffect(() => {
        if (connected && sdk) {
            fetchAllUserPositions();
        }
    }, [connected, sdk, fetchAllUserPositions]);

    const renderContent = () => {
        if (isLoading) {
            return (
                <div>
                    <p>{statusMessage}</p>
                    {eta && <p style={{ color: "#888" }}>{eta}</p>}
                </div>
            );
        }
        if (allEnrichedPositions.length === 0) {
            return (
                <div style={{ textAlign: 'center', marginTop: '50px' }}>
                    <p>{statusMessage || "No liquidity positions found."}</p>
                </div>
            );
        }
        return (
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                    <div style={{ display: 'flex', gap: '5px' }}>
                        {(['all', 'active', 'inactive', 'empty'] as PositionFilter[]).map(f => (
                            <button key={f} onClick={() => setPositionFilter(f)} style={getFilterButtonStyle(positionFilter === f)}>
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>
                    <input
                        type="text"
                        placeholder="Search by pair or pool address"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ padding: '8px', minWidth: '250px' }}
                    />
                    <select
                        value={sortOption}
                        onChange={(e) => setSortOption(e.target.value as "desc" | "asc")}
                        style={{ padding: "8px", background: "#222", border: "1px solid #444", borderRadius: "4px", color: "white" }}
                    >
                        <option value="desc">Sort by Liquidity: High to Low</option>
                        <option value="asc">Sort by Liquidity: Low to High</option>
                    </select>
                </div>
                
                {processedPositions.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: "20px" }}>
                        {processedPositions.map((data) => (
                            <PositionCard
                                key={data.key}
                                enrichedData={data}
                                onRemove={() => handleOpenRemoveModal(data)}
                                onRebalance={() => handleOpenRebalanceModal(data)}
                                onSelect={() => handleSelectPosition(data)}
                                onBurn={() => handleOpenBurnModal(data)}
                            />
                        ))}
                    </div>
                ) : (
                    <p>No positions match your current filters.</p>
                )}
            </div>
        );
    };

    return (
        <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                    <a href="/" style={{ textDecoration: "none", color: "#aaa" }}>&larr; Back to Pools</a>
                    <h1>My DLMM Positions</h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                     <a 
                        href="/" 
                        style={{ 
                            padding: '8px 12px', background: '#3a76f7', color: 'white', textDecoration: 'none',
                            borderRadius: '4px', border: '1px solid #3a76f7',
                            pointerEvents: isLoading ? 'none' : 'auto', opacity: isLoading ? 0.6 : 1
                        }}
                    >
                        + Add Liquidity
                    </a>
                    <button onClick={() => fetchAllUserPositions(true)} disabled={isLoading}>Refresh</button>
                    <WalletMultiButton />
                </div>
            </header>
            <hr style={{ margin: "20px 0" }} />
            <main>
                {!connected ? (
                    <p>Please connect your wallet to continue.</p>
                ) : sdk && publicKey ? (
                    <>
                        <RemoveLiquidityModal 
                            isOpen={isRemoveModalOpen} 
                            onClose={() => setIsRemoveModalOpen(false)} 
                            sdk={sdk} 
                            positionToRemove={selectedPosition} 
                            onSuccess={handleRefreshAndCloseModals} 
                        />
                        <RebalanceModal 
                            isOpen={isRebalanceModalOpen} 
                            onClose={() => setIsRebalanceModalOpen(false)} 
                            sdk={sdk} 
                            positionToRebalance={selectedPosition} 
                            onSuccess={handleRefreshAndCloseModals} 
                        />
                        <BurnPositionModal
                            isOpen={isBurnModalOpen}
                            onClose={() => setIsBurnModalOpen(false)}
                            sdk={sdk}
                            positionToBurn={selectedPosition}
                            onSuccess={handleRefreshAndCloseModals}
                        />
                        {renderContent()}
                    </>
                ) : ( 
                    <p>Initializing...</p> 
                )}
            </main>
        </div>
    );
};

const getFilterButtonStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '5px 10px', border: isActive ? '1px solid #3a76f7' : '1px solid #444',
    background: isActive ? '#3a76f7' : 'none', color: 'white', cursor: 'pointer', borderRadius: '5px'
});

function AllPositionsPage() {
  return (
    <WalletProvider>
      <PositionsPageContent />
    </WalletProvider>
  );
}

export default AllPositionsPage;