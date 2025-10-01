"use client";

import React, { useState, useEffect, useMemo } from 'react';
// --- 1. USE 'useRouter' FROM 'next/navigation' ---
import { useParams, useRouter } from 'next/navigation';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { EnrichedPositionData } from '../page';
import { LiquidityBookServices, MODE } from '@saros-finance/dlmm-sdk';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import dynamic from 'next/dynamic';
import { AnchorProvider, setProvider } from '@coral-xyz/anchor';
import { RemoveLiquidityModal } from '@/components/modals/RemoveLiquidityModal';
import { RebalanceModal } from '@/components/modals/RebalanceModal';
import { TokenInfo } from '@/utils/token';
import { BurnPositionModal } from '@/components/modals/BurnPositionModal';

const WalletProvider = dynamic(() => import("@/components/walletContextProvider").then((mod) => mod.WalletContextProvider), { ssr: false });

// --- Helper Components ---
const CopyIcon: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 5px', color: '#aaa' }} title="Copy">
      {copied ? '✓' : '📋'}
    </button>
  );
};

const InfoRow: React.FC<{ label: string; value: React.ReactNode; isAddress?: boolean }> = ({ label, value, isAddress }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #333' }}>
        <span style={{ color: '#aaa' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: isAddress ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>
            {value}
            {isAddress && typeof value === 'string' && <CopyIcon textToCopy={value} />}
        </div>
    </div>
);

const logoStyle: React.CSSProperties = { width: 40, height: 40, borderRadius: "50%", backgroundColor: "#333" };
const FallbackLogo: React.FC<{ symbol?: string }> = ({ symbol }) => (<div style={{...logoStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold' }}>{symbol ? symbol.charAt(0).toUpperCase() : '?'}</div>);
const PairLogos: React.FC<{ baseToken: TokenInfo; quoteToken: TokenInfo; }> = ({ baseToken, quoteToken }) => (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {baseToken.logoURI ? <img src={baseToken.logoURI} alt={baseToken.symbol} style={logoStyle} /> : <FallbackLogo symbol={baseToken.symbol} />}
      {quoteToken.logoURI ? <img src={quoteToken.logoURI} alt={quoteToken.symbol} style={{...logoStyle, marginLeft: '-12px', border: '2px solid #1a1a1a' }} /> : <FallbackLogo symbol={quoteToken.symbol} />}
    </div>
);

const getPriceFromBinId = (binId: number, binStep: number, baseDecimals: number, quoteDecimals: number): number => (1.0001 ** binId) * (10 ** (baseDecimals - quoteDecimals));
const formatPrice = (price: number): string => {
    if (price === Infinity) return 'Infinity';
    if (!isFinite(price)) return 'Out of Range';
    return price.toFixed(6);
};

// --- Main Content Component ---
const PositionDetailsContent = () => {
    const params = useParams();
    // --- 2. INITIALIZE ROUTER ---
    const router = useRouter();
    const { connection } = useConnection();
    const wallet = useWallet();
    const { publicKey, connected } = wallet;
    
    const [positionData, setPositionData] = useState<EnrichedPositionData | null>(null);
    const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
    const [isRebalanceModalOpen, setIsRebalanceModalOpen] = useState(false);
    const [isBurnModalOpen, setIsBurnModalOpen] = useState(false);

    const mintAddress = params.mint as string;

    useEffect(() => {
        if (mintAddress) {
            const cachedData = sessionStorage.getItem(`position_details_${mintAddress}`);
            if (cachedData) {
                try { setPositionData(JSON.parse(cachedData)); } 
                catch (e) { router.replace('/positions'); }
            } else { router.replace('/positions'); }
        }
    }, [mintAddress, router]);

    const sdk = useMemo(() => {
        if (!connected || !wallet) return null;
        const provider = new AnchorProvider(connection, wallet as any, AnchorProvider.defaultOptions());
        setProvider(provider);
        return new LiquidityBookServices({ mode: MODE.DEVNET });
    }, [connected, connection, wallet]);

    const handleRefreshAndCloseModals = () => {
        setIsRemoveModalOpen(false);
        setIsRebalanceModalOpen(false);
        setIsBurnModalOpen(false);
        // After an action, it's better to go back to the list.
        router.push('/positions');
    };

    if (!positionData) {
        return <div style={{ padding: '20px', textAlign: 'center' }}>Loading position details...</div>;
    }

    const { position, poolDetails, baseToken, quoteToken, poolAddress, key } = positionData;
    const totalLiquidity = position.liquidityShares.reduce((acc, current) => acc + BigInt(current), BigInt(0));
    
    let status: 'Active' | 'Inactive' | 'Empty' = 'Inactive';
    let statusColor = '#FFA500';
    if (totalLiquidity === BigInt(0)) { status = 'Empty'; statusColor = '#888888'; }
    else if (poolDetails.activeId >= position.lowerBinId && poolDetails.activeId <= position.upperBinId) { status = 'Active'; statusColor = '#22C55E'; }

    const minPrice = getPriceFromBinId(position.lowerBinId, poolDetails.binStep, baseToken.decimals, quoteToken.decimals);
    const maxPrice = getPriceFromBinId(position.upperBinId, poolDetails.binStep, baseToken.decimals, quoteToken.decimals);
    const isActionDisabled = status === 'Empty';

    return (
        <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: '1000px', margin: '0 auto' }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: '20px' }}>
                {/* --- 3. USE ROUTER.BACK() FOR NAVIGATION --- */}
                <button onClick={() => router.back()} style={{ all: 'unset', cursor: 'pointer', color: "#aaa" }}>
                    &larr; Back
                </button>
                <WalletMultiButton />
            </header>
            
            <main>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
                    <PairLogos baseToken={baseToken} quoteToken={quoteToken} />
                    <div>
                        <h1 style={{ margin: 0 }}>{baseToken.symbol} / {quoteToken.symbol}</h1>
                        <p style={{ margin: '5px 0 0 0', color: '#aaa' }}>Liquidity Position</p>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '40px' }}>
                    <div style={{ background: '#1e1e1e', padding: '20px', borderRadius: '8px', border: '1px solid #444' }}>
                       <h3 style={{ marginTop: 0 }}>Details</h3>
                       <InfoRow label="Status" value={<span style={{ padding: '4px 10px', background: statusColor, color: 'white', borderRadius: '12px', fontSize: '14px' }}>{status}</span>} />
                       <InfoRow label="Liquidity Shares" value={totalLiquidity.toString()} />
                       <InfoRow label="Min Price" value={`${formatPrice(minPrice)} ${quoteToken.symbol}`} />
                       <InfoRow label="Max Price" value={`${formatPrice(maxPrice)} ${quoteToken.symbol}`} />
                       <InfoRow label="Bin IDs" value={`${position.lowerBinId} to ${position.upperBinId}`} />
                       <InfoRow label="Position NFT Mint" value={key} isAddress />
                       <InfoRow label="Pool Address" value={poolAddress} isAddress />
                    </div>
                    <div style={{ background: '#1e1e1e', padding: '20px', borderRadius: '8px', border: '1px solid #444' }}>
                        <h3 style={{ marginTop: 0 }}>Actions</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <button onClick={() => setIsRebalanceModalOpen(true)} disabled={isActionDisabled} title={isActionDisabled ? 'Cannot rebalance an empty position' : ''}>Rebalance</button>
                            <button onClick={() => setIsRemoveModalOpen(true)} disabled={isActionDisabled} title={isActionDisabled ? 'Cannot remove from an empty position' : ''} style={{ background: '#c93c3c' }}>Remove Liquidity</button>
                            {status === 'Empty' && (
                                <button onClick={() => setIsBurnModalOpen(true)} style={{ background: '#555' }}>
                                    Burn Position NFT
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {sdk && publicKey && (
                    <>
                        <RemoveLiquidityModal isOpen={isRemoveModalOpen} onClose={() => setIsRemoveModalOpen(false)} sdk={sdk} positionToRemove={positionData} onSuccess={handleRefreshAndCloseModals} />
                        <RebalanceModal isOpen={isRebalanceModalOpen} onClose={() => setIsRebalanceModalOpen(false)} sdk={sdk} positionToRebalance={positionData} onSuccess={handleRefreshAndCloseModals} />
                        <BurnPositionModal isOpen={isBurnModalOpen} onClose={() => setIsBurnModalOpen(false)} sdk={sdk} positionToBurn={positionData} onSuccess={handleRefreshAndCloseModals} />
                    </>
                )}
            </main>
        </div>
    );
};

export default function PositionDetailsPage() {
    return (
        <WalletProvider>
            <PositionDetailsContent />
        </WalletProvider>
    );
}