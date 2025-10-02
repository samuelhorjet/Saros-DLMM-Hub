"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LiquidityBookServices } from '@saros-finance/dlmm-sdk';
import { PublicKey } from '@solana/web3.js';
import { PositionInfo } from '@saros-finance/dlmm-sdk/types/services';
import { getPriceFromId } from '@saros-finance/dlmm-sdk/utils/price';
import { getTokenInfo, TokenInfo } from '@/utils/token';
import { AddLiquidity } from './AddLiquidity';
import { PositionCard } from './PositionCard';
import { RemoveLiquidityModal } from './modals/RemoveLiquidityModal';
import { RebalanceModal } from './modals/RebalanceModal';
import { BurnPositionModal } from './modals/BurnPositionModal';
import { EnrichedPositionData } from '@/app/positions/page';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, Copy, RefreshCw, AlertTriangle } from 'lucide-react';

// --- Helper Components ---
const CopyButton: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="icon" onClick={handleCopy} className="h-6 w-6 text-muted-foreground">
      <Copy className="h-3 w-3" />
      <span className="sr-only">{copied ? "Copied!" : "Copy"}</span>
    </Button>
  );
};

const InfoRow: React.FC<{ label: string; value: string | number; children?: React.ReactNode }> = ({ label, value, children }) => (
    <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        {value && <span className="font-mono">{value}</span>}
        {children}
    </div>
);

const TokenLogo: React.FC<{ token: TokenInfo }> = ({ token }) => (
    token.logoURI ? <img src={token.logoURI} alt={token.symbol} width={20} height={20} className="rounded-full" />
    : <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-bold">{token.symbol.charAt(0)}</div>
);

type PositionFilter = 'all' | 'active' | 'inactive' | 'empty';

interface PoolData {
    pairAccount: any;
    baseTokenInfo: TokenInfo;
    quoteTokenInfo: TokenInfo;
    price: number;
}

interface PoolDetailsProps {
    sdk: LiquidityBookServices;
    poolAddress: string;
    userPublicKey: PublicKey;
    onBack: () => void;
}

export const PoolDetails: React.FC<PoolDetailsProps> = ({ sdk, poolAddress, userPublicKey, onBack }) => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const initialTab = searchParams.get('tab') === 'myPositions' ? 'myPositions' : 'addLiquidity';
    const [activeTab, setActiveTab] = useState<'addLiquidity' | 'myPositions'>(initialTab);
    
    const [poolData, setPoolData] = useState<PoolData | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(true);
    const [detailsError, setDetailsError] = useState<string | null>(null);

    const [allPositions, setAllPositions] = useState<PositionInfo[]>([]);
    const [loadingPositions, setLoadingPositions] = useState(false);
    const [positionsError, setPositionsError] = useState<string | null>(null);
    const [positionStatus, setPositionStatus] = useState('');
    const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
    
    const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');
    
    const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
    const [isRebalanceModalOpen, setIsRebalanceModalOpen] = useState(false);
    const [isBurnModalOpen, setIsBurnModalOpen] = useState(false);
    const [selectedPosition, setSelectedPosition] = useState<EnrichedPositionData | null>(null);
    
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        return () => {
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
        };
    }, []);

    const startCountdown = (seconds: number) => {
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
        }
        setRetryCountdown(seconds);
        countdownIntervalRef.current = setInterval(() => {
            setRetryCountdown(prev => {
                if (prev === null || prev <= 1) {
                    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                    return null;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const getPositionCacheKey = useCallback(() => `cached_positions_${poolAddress}_${userPublicKey.toBase58()}`, [poolAddress, userPublicKey]);

    const handleFetchPositions = useCallback(async (forceRefresh: boolean = false) => {
        if (!poolData) return;
        
        const cacheKey = getPositionCacheKey();
        if (!forceRefresh) {
            const cachedData = sessionStorage.getItem(cacheKey);
            if (cachedData) {
                try {
                    const cachedPositions = JSON.parse(cachedData);
                    setAllPositions(cachedPositions);
                    setPositionStatus(`Loaded ${cachedPositions.length} positions from cache.`);
                    return;
                } catch (e) { console.error("Failed to parse cached positions, refetching...", e); }
            }
        }

        setLoadingPositions(true);
        setPositionsError(null);
        setAllPositions([]);
        setRetryCountdown(null);
        
        const MAX_ATTEMPTS = 3;
        const RETRY_DELAY = 5000;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            setPositionStatus(`Fetching positions... (Attempt ${attempt} of ${MAX_ATTEMPTS})`);
            try {
                const userPositions = await sdk.getUserPositions({ payer: userPublicKey, pair: new PublicKey(poolAddress) });
                setPositionStatus(`Successfully fetched ${userPositions.length} positions.`);
                setAllPositions(userPositions);
                sessionStorage.setItem(cacheKey, JSON.stringify(userPositions));
                setLoadingPositions(false);
                return;
            } catch (err: any) {
                console.error(`Attempt ${attempt} failed:`, err);
                if (attempt === MAX_ATTEMPTS) {
                    setPositionsError("Failed to fetch positions after several attempts. The network may be congested. Please try refreshing again shortly.");
                } else {
                    startCountdown(RETRY_DELAY / 1000);
                    await new Promise(res => setTimeout(res, RETRY_DELAY));
                }
            }
        }
        setLoadingPositions(false);
    }, [sdk, poolAddress, userPublicKey, poolData, getPositionCacheKey]);

    useEffect(() => {
        const fetchPoolDetails = async () => {
            setLoadingDetails(true);
            setDetailsError(null);
            try {
                const [pairAccount, metadata] = await Promise.all([
                    sdk.getPairAccount(new PublicKey(poolAddress)),
                    sdk.fetchPoolMetadata(poolAddress) as any
                ]);
                pairAccount.reserveX = metadata.baseReserve;
                pairAccount.reserveY = metadata.quoteReserve;

                const [baseToken, quoteToken] = await Promise.all([
                    getTokenInfo(pairAccount.tokenMintX.toString()),
                    getTokenInfo(pairAccount.tokenMintY.toString())
                ]);
                const price = getPriceFromId(pairAccount.binStep, pairAccount.activeId, baseToken.decimals, quoteToken.decimals);
                setPoolData({ pairAccount, baseTokenInfo: baseToken, quoteTokenInfo: quoteToken, price });
            } catch (err: any) {
                setDetailsError(`Failed to load pool details. The address may be invalid or the network is busy.`);
            } finally {
                setLoadingDetails(false);
            }
        };
        fetchPoolDetails();
    }, [sdk, poolAddress]);

    const handleTabClick = (tab: 'addLiquidity' | 'myPositions') => {
        setActiveTab(tab);
        const newUrl = `${pathname}?tab=${tab}`;
        router.push(newUrl, { scroll: false });

        if (tab === 'myPositions' && !loadingDetails && poolData && allPositions.length === 0 && !positionsError) {
            handleFetchPositions(false);
        }
    };
    
    const handleRefreshAndCloseModals = () => {
        setIsRemoveModalOpen(false);
        setIsRebalanceModalOpen(false);
        setIsBurnModalOpen(false);
        handleFetchPositions(true);
    };

    const handleSelectPosition = (positionData: EnrichedPositionData) => {
        sessionStorage.setItem(`position_details_${positionData.key}`, JSON.stringify(positionData));
        router.push(`/positions/${positionData.key}`);
    };
    
    const openModal = (type: 'remove' | 'rebalance' | 'burn', position: EnrichedPositionData) => {
        setSelectedPosition(position);
        if (type === 'remove') setIsRemoveModalOpen(true);
        if (type === 'rebalance') setIsRebalanceModalOpen(true);
        if (type === 'burn') setIsBurnModalOpen(true);
    };

    const enrichedPositions = useMemo(() => {
        if (!poolData) return [];
        return allPositions.map(pos => ({
            key: pos.positionMint,
            position: pos,
            poolDetails: poolData.pairAccount,
            baseToken: poolData.baseTokenInfo,
            quoteToken: poolData.quoteTokenInfo,
            poolAddress: poolAddress
        }));
    }, [allPositions, poolData, poolAddress]);

    const filteredPositions = useMemo(() => {
        if (!poolData) return [];
        return enrichedPositions.filter(posData => {
            const totalLiquidity = posData.position.liquidityShares.reduce((acc, current) => acc + BigInt(current), BigInt(0));
            if (positionFilter === 'empty') return totalLiquidity === BigInt(0);
            const isActive = poolData.pairAccount.activeId >= posData.position.lowerBinId && poolData.pairAccount.activeId <= posData.position.upperBinId;
            if (positionFilter === 'active') return totalLiquidity > BigInt(0) && isActive;
            if (positionFilter === 'inactive') return totalLiquidity > BigInt(0) && !isActive;
            return true;
        });
    }, [enrichedPositions, positionFilter, poolData]);

    const renderPoolInfo = () => {
        if (loadingDetails) {
            return <Skeleton className="h-[300px] w-full" />;
        }
        if (detailsError || !poolData) {
            return (
                 <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error Loading Pool</AlertTitle>
                    <AlertDescription>{detailsError || "Could not retrieve pool data."}</AlertDescription>
                 </Alert>
            )
        }
        
        const { baseTokenInfo, quoteTokenInfo, pairAccount, price } = poolData;
        const reserveX = Number(pairAccount.reserveX?.toString() || '0');
        const reserveY = Number(pairAccount.reserveY?.toString() || '0');

        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <span>{baseTokenInfo.symbol} / {quoteTokenInfo.symbol}</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <InfoRow label="Current Price" value={`${price.toFixed(6)} ${quoteTokenInfo.symbol}`} />
                    <InfoRow label={`${baseTokenInfo.symbol} Reserves`} value={''}>
                        <div className="flex items-center gap-2 font-mono">
                           <TokenLogo token={baseTokenInfo} /> {reserveX.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                    </InfoRow>
                     <InfoRow label={`${quoteTokenInfo.symbol} Reserves`} value={''}>
                        <div className="flex items-center gap-2 font-mono">
                           <TokenLogo token={quoteTokenInfo} /> {reserveY.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                    </InfoRow>
                    <InfoRow label="Bin Step" value={pairAccount.binStep} />
                    <InfoRow label="Active Bin ID" value={pairAccount.activeId} />
                    <InfoRow label="Pool Address" value={''}>
                        <div className="flex items-center">
                           <span className="font-mono text-xs">{`${poolAddress.slice(0, 6)}...${poolAddress.slice(-6)}`}</span>
                           <CopyButton textToCopy={poolAddress} />
                        </div>
                    </InfoRow>
                </CardContent>
            </Card>
        )
    };

    return (
        <div className="animate-slide-up">
            <Button variant="ghost" onClick={onBack} className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Pools
            </Button>
            
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <aside className="lg:col-span-1">
                    <div className="sticky top-20 space-y-4">
                        {renderPoolInfo()}
                    </div>
                </aside>

                <div className="lg:col-span-2">
                    <div className="flex border-b">
                        <Button variant="ghost" onClick={() => handleTabClick('addLiquidity')} className={`rounded-none border-b-2 ${activeTab === 'addLiquidity' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>Add Liquidity</Button>
                        <Button variant="ghost" onClick={() => handleTabClick('myPositions')} className={`rounded-none border-b-2 ${activeTab === 'myPositions' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>My Positions</Button>
                    </div>

                    <div className="mt-6">
                        {activeTab === 'addLiquidity' && poolData && (
                            <AddLiquidity sdk={sdk} poolAddress={poolAddress} userPublicKey={userPublicKey} baseTokenInfo={poolData.baseTokenInfo} quoteTokenInfo={poolData.quoteTokenInfo} binStep={poolData.pairAccount.binStep} activeId={poolData.pairAccount.activeId} price={poolData.price} onLiquidityAdded={() => handleFetchPositions(true)} />
                        )}
                        {activeTab === 'myPositions' && (
                             <div>
                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex gap-2">
                                        {(['all', 'active', 'inactive', 'empty'] as PositionFilter[]).map(f => (
                                            <Button key={f} variant={positionFilter === f ? 'default' : 'outline'} size="sm" onClick={() => setPositionFilter(f)}>{f.charAt(0).toUpperCase() + f.slice(1)}</Button>
                                        ))}
                                    </div>
                                    <Button variant="outline" size="icon" onClick={() => handleFetchPositions(true)} disabled={loadingPositions}>
                                        <RefreshCw className={`h-4 w-4 ${loadingPositions ? 'animate-spin' : ''}`} />
                                    </Button>
                                </div>

                                {loadingPositions ? (
                                    <div className="text-center">
                                        <p className="text-sm text-muted-foreground mb-2">{positionStatus}</p>
                                        {retryCountdown !== null && (
                                            <p className="text-sm font-bold text-primary mb-4">
                                                Retrying in {retryCountdown} seconds...
                                            </p>
                                        )}
                                        <Skeleton className="h-40 w-full" />
                                    </div>
                                ) : 
                                positionsError ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{positionsError}</AlertDescription></Alert> :
                                allPositions.length > 0 ? (
                                    filteredPositions.length > 0 ? (
                                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                            {filteredPositions.map((posData) => (
                                                <PositionCard 
                                                    key={posData.key} 
                                                    enrichedData={posData} 
                                                    onRemove={() => openModal('remove', posData)}
                                                    onRebalance={() => openModal('rebalance', posData)}
                                                    onSelect={() => handleSelectPosition(posData)}
                                                    onBurn={() => openModal('burn', posData)}
                                                />
                                            ))}
                                        </div>
                                    ) : <p className="text-center text-muted-foreground py-8">No positions match the current filter.</p>
                                ) : <p className="text-center text-muted-foreground py-8">You do not have any liquidity positions in this pool.</p>
                                }
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <RemoveLiquidityModal isOpen={isRemoveModalOpen} onClose={() => setIsRemoveModalOpen(false)} sdk={sdk} positionToRemove={selectedPosition} onSuccess={handleRefreshAndCloseModals} />
            <RebalanceModal isOpen={isRebalanceModalOpen} onClose={() => setIsRebalanceModalOpen(false)} sdk={sdk} positionToRebalance={selectedPosition} onSuccess={handleRefreshAndCloseModals} />
            <BurnPositionModal isOpen={isBurnModalOpen} onClose={() => setIsBurnModalOpen(false)} sdk={sdk} positionToBurn={selectedPosition} onSuccess={handleRefreshAndCloseModals} />
        </div>
    );
};