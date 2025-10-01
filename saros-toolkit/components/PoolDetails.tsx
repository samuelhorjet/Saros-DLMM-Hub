"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LiquidityBookServices, MODE } from '@saros-finance/dlmm-sdk';
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
import { useWallet } from '@solana/wallet-adapter-react';
// --- 1. IMPORT ROUTER HOOKS ---
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

const InfoRow: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #333' }}>
        <span style={{ color: '#aaa' }}>{label}</span>
        <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{value}</span>
    </div>
);

const CopyIcon: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', color: 'white' }} title="Copy address" >
      {copied ? '✓' : '📋'}
    </button>
  );
};

const logoStyle: React.CSSProperties = {
    width: 28, height: 28, borderRadius: '50%', backgroundColor: '#333',
    border: '2px solid #1a1a1a',
};

const FallbackLogo: React.FC<{ symbol?: string }> = ({ symbol }) => (
    <div style={{ ...logoStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>
        {symbol ? symbol.charAt(0).toUpperCase() : '?'}
    </div>
);

const PairLogos: React.FC<{ baseLogo?: string; quoteLogo?: string; baseSymbol?: string; quoteSymbol?: string; }> = ({ baseLogo, quoteLogo, baseSymbol, quoteSymbol }) => (
    <div style={{ display: 'flex', alignItems: 'center' }}>
        {baseLogo ? <img src={baseLogo} alt={baseSymbol} style={logoStyle} /> : <FallbackLogo symbol={baseSymbol} />}
        {quoteLogo ? <img src={quoteLogo} alt={quoteSymbol} style={{ ...logoStyle, marginLeft: '-10px' }} /> : <FallbackLogo symbol={quoteSymbol} />}
    </div>
);

const TokenLogo: React.FC<{ token: TokenInfo }> = ({ token }) => (
    token.logoURI ? <img src={token.logoURI} alt={token.symbol} width={24} height={24} style={{ borderRadius: '50%' }} />
    : <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>{token.symbol.charAt(0)}</div>
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
    // --- 2. INITIALIZE ROUTER AND READ PARAMS ---
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Set initial tab based on URL, defaulting to 'addLiquidity'
    const initialTab = searchParams.get('tab') === 'myPositions' ? 'myPositions' : 'addLiquidity';
    const [activeTab, setActiveTab] = useState<'addLiquidity' | 'myPositions'>(initialTab);
    
    const [poolData, setPoolData] = useState<PoolData | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(true);
    const [detailsError, setDetailsError] = useState<string | null>(null);

    const [allPositions, setAllPositions] = useState<PositionInfo[]>([]);
    const [loadingPositions, setLoadingPositions] = useState(false);
    const [positionsError, setPositionsError] = useState<string | null>(null);
    const [positionStatus, setPositionStatus] = useState('');
    
    const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');
    
    const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
    const [isRebalanceModalOpen, setIsRebalanceModalOpen] = useState(false);
    const [isBurnModalOpen, setIsBurnModalOpen] = useState(false);
    const [selectedPosition, setSelectedPosition] = useState<EnrichedPositionData | null>(null);

    const getPositionCacheKey = useCallback(() => `cached_positions_${poolAddress}`, [poolAddress]);

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
        
        const MAX_ATTEMPTS = 3;
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
                    setPositionsError("Failed to fetch positions due to network congestion. Please try again.");
                } else { await new Promise(res => setTimeout(res, 5000)); }
            }
        }
        setLoadingPositions(false);
    }, [sdk, poolAddress, userPublicKey, poolData, getPositionCacheKey]);

    useEffect(() => {
        setLoadingDetails(true);
        setDetailsError(null);
        setPoolData(null);
        setAllPositions([]);
        setPositionsError(null);
        setPositionStatus('');
        // We set the active tab from the URL state, so we don't reset it here anymore.
        // setActiveTab('addLiquidity');

        const fetchPoolDetails = async () => {
            try {
                const [pairAccount, metadata] = await Promise.all([
                    sdk.getPairAccount(new PublicKey(poolAddress)),
                    sdk.fetchPoolMetadata(poolAddress) as any
                ]);
                if (!pairAccount || !metadata) throw new Error("Pool account or metadata is incomplete.");
                pairAccount.reserveX = metadata.baseReserve;
                pairAccount.reserveY = metadata.quoteReserve;

                const [baseToken, quoteToken] = await Promise.all([
                    getTokenInfo(pairAccount.tokenMintX.toString()),
                    getTokenInfo(pairAccount.tokenMintY.toString())
                ]);
                const price = getPriceFromId(pairAccount.binStep, pairAccount.activeId, baseToken.decimals, quoteToken.decimals);
                setPoolData({ pairAccount, baseTokenInfo: baseToken, quoteTokenInfo: quoteToken, price });
            } catch (err: any) {
                setDetailsError(`Failed to load pool details. ${err.message}`);
            } finally {
                setLoadingDetails(false);
            }
        };
        fetchPoolDetails();
    }, [sdk, poolAddress, userPublicKey]); 

    // --- 3. MODIFY TAB CLICK HANDLER ---
    const handleTabClick = (tab: 'addLiquidity' | 'myPositions') => {
        setActiveTab(tab);
        // Update URL to reflect the new tab state without reloading the page
        const newUrl = `${pathname}?pool=${poolAddress}&tab=${tab}`;
        router.push(newUrl);

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

    const handleSelectPosition = (positionData: EnrichedPositionData) => {
        sessionStorage.setItem(`position_details_${positionData.key}`, JSON.stringify(positionData));
        router.push(`/positions/${positionData.key}`);
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
    
    const { reserveX, reserveY, totalLiquidity } = useMemo(() => {
        if (!poolData) return { reserveX: 0, reserveY: 0, totalLiquidity: 0 };
        const rX = Number(poolData.pairAccount.reserveX?.toString() || '0');
        const rY = Number(poolData.pairAccount.reserveY?.toString() || '0');
        return { reserveX: rX, reserveY: rY, totalLiquidity: rX + rY };
    }, [poolData]);

    const formatShortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-6)}`;

    return (
        <div>
            <button onClick={onBack} style={{ marginBottom: "20px" }}>&larr; Back to List</button>
            <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, position: 'sticky', top: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        {poolData && (<PairLogos baseLogo={poolData.baseTokenInfo.logoURI} quoteLogo={poolData.quoteTokenInfo.logoURI} baseSymbol={poolData.baseTokenInfo.symbol} quoteSymbol={poolData.quoteTokenInfo.symbol} />)}
                        <h2>{poolData ? `${poolData.baseTokenInfo.symbol} / ${poolData.quoteTokenInfo.symbol}` : "Pool Details"}</h2>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '10px' }}>
                        <strong style={{whiteSpace: 'nowrap'}}>Address:</strong>
                        <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{poolAddress}</span>
                        <CopyIcon textToCopy={poolAddress} />
                    </div>
                    {loadingDetails ? <p>Loading pool info...</p> : detailsError ? <p style={{color: 'red'}}>{detailsError}</p> : poolData ? (
                        <div style={{ border: "1px solid #444", padding: "16px", borderRadius: "8px" }}>
                            <h4 style={{ marginTop: 0, marginBottom: '12px', borderBottom: '1px solid #555', paddingBottom: '8px' }}>Pool Statistics</h4>
                            <InfoRow label="Current Price" value={`${poolData.price.toFixed(6)} ${poolData.quoteTokenInfo.symbol}`} />
                            <InfoRow label="Total Liquidity ($)" value={totalLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #333' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <TokenLogo token={poolData.baseTokenInfo} />
                                    <span style={{ color: '#aaa' }}>{poolData.baseTokenInfo.symbol} Reserves</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                    <span style={{ fontFamily: 'monospace' }}>{reserveX.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                                        <span style={{ fontFamily: 'monospace', color: '#888' }}>{formatShortAddress(poolData.baseTokenInfo.mintAddress)}</span>
                                        <CopyIcon textToCopy={poolData.baseTokenInfo.mintAddress} />
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #333' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <TokenLogo token={poolData.quoteTokenInfo} />
                                    <span style={{ color: '#aaa' }}>{poolData.quoteTokenInfo.symbol} Reserves</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                    <span style={{ fontFamily: 'monospace' }}>{reserveY.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                                        <span style={{ fontFamily: 'monospace', color: '#888' }}>{formatShortAddress(poolData.quoteTokenInfo.mintAddress)}</span>
                                        <CopyIcon textToCopy={poolData.quoteTokenInfo.mintAddress} />
                                    </div>
                                </div>
                            </div>
                            <InfoRow label="Bin Step" value={poolData.pairAccount.binStep} />
                            <InfoRow label="Active Bin ID" value={poolData.pairAccount.activeId} />
                        </div>
                    ) : <p>Could not load pool details.</p>}
                </div>

                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', borderBottom: '1px solid #444', marginBottom: '20px' }}>
                        <button onClick={() => handleTabClick('addLiquidity')} style={getTabStyle(activeTab === 'addLiquidity')}>Add Liquidity</button>
                        <button onClick={() => handleTabClick('myPositions')} style={getTabStyle(activeTab === 'myPositions')}>My Positions</button>
                    </div>

                    {loadingDetails || !poolData ? <p>Waiting for pool details...</p> : activeTab === 'addLiquidity' ? (
                        <AddLiquidity sdk={sdk} poolAddress={poolAddress} userPublicKey={userPublicKey} baseTokenInfo={poolData.baseTokenInfo} quoteTokenInfo={poolData.quoteTokenInfo} binStep={poolData.pairAccount.binStep} activeId={poolData.pairAccount.activeId} price={poolData.price} onLiquidityAdded={() => handleFetchPositions(true)} />
                    ) : (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    {(['all', 'active', 'inactive', 'empty'] as PositionFilter[]).map(f => (<button key={f} onClick={() => setPositionFilter(f)} style={getFilterButtonStyle(positionFilter === f)}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>))}
                                </div>
                                <button onClick={() => handleFetchPositions(true)} disabled={loadingPositions}>Refresh</button>
                            </div>

                            {loadingPositions && <p>{positionStatus}</p>}
                            {positionsError && <div><p style={{ color: 'red' }}>{positionsError}</p><button onClick={() => handleFetchPositions(true)}>Retry</button></div>}
                            
                            {!loadingPositions && !positionsError && (
                                enrichedPositions.length > 0 ? (
                                    filteredPositions.length > 0 ? (
                                        <div style={{ maxHeight: '70vh', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr', gap: '15px', paddingRight: '10px' }}>
                                            {filteredPositions.map((posData) => (
                                                <PositionCard 
                                                    key={posData.key} 
                                                    enrichedData={posData} 
                                                    onRemove={() => handleOpenRemoveModal(posData)} 
                                                    onRebalance={() => handleOpenRebalanceModal(posData)} 
                                                    onSelect={() => handleSelectPosition(posData)}
                                                    onBurn={() => handleOpenBurnModal(posData)}
                                                />
                                            ))}
                                        </div>
                                    ) : <p>No positions match the current filter.</p>
                                ) : <p>You do not have any liquidity positions in this pool.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
            
            <RemoveLiquidityModal isOpen={isRemoveModalOpen} onClose={() => setIsRemoveModalOpen(false)} sdk={sdk} positionToRemove={selectedPosition} onSuccess={handleRefreshAndCloseModals} />
            <RebalanceModal isOpen={isRebalanceModalOpen} onClose={() => setIsRebalanceModalOpen(false)} sdk={sdk} positionToRebalance={selectedPosition} onSuccess={handleRefreshAndCloseModals} />
            <BurnPositionModal 
                isOpen={isBurnModalOpen} 
                onClose={() => setIsBurnModalOpen(false)} 
                sdk={sdk} 
                positionToBurn={selectedPosition} 
                onSuccess={handleRefreshAndCloseModals} 
            />
        </div>
    );
};

const getTabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', color: isActive ? '#3a76f7' : 'white',
    borderBottom: isActive ? '2px solid #3a76f7' : '2px solid transparent', marginBottom: '-1px'
});

const getFilterButtonStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '5px 10px', border: isActive ? '1px solid #3a76f7' : '1px solid #444',
    background: isActive ? '#3a76f7' : 'none', color: 'white', cursor: 'pointer', borderRadius: '5px'
});