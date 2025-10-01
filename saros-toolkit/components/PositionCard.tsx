// src/components/PositionCard.tsx
"use client";
import React from 'react';
import { TokenInfo } from '@/utils/token';
import { EnrichedPositionData } from '@/app/positions/page';

// --- NEW HELPER COMPONENTS ---
const logoStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  backgroundColor: "#333",
};

const FallbackLogo: React.FC<{ symbol?: string }> = ({ symbol }) => (
  <div style={{ ...logoStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>
    {symbol ? symbol.charAt(0).toUpperCase() : '?'}
  </div>
);

const PairLogos: React.FC<{ baseToken: TokenInfo; quoteToken: TokenInfo; }> = ({ baseToken, quoteToken }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {baseToken.logoURI ? <img src={baseToken.logoURI} alt={baseToken.symbol} style={logoStyle} /> : <FallbackLogo symbol={baseToken.symbol} />}
      {quoteToken.logoURI ? <img src={quoteToken.logoURI} alt={quoteToken.symbol} style={{...logoStyle, marginLeft: '-8px' }} /> : <FallbackLogo symbol={quoteToken.symbol} />}
    </div>
  );
};
// --- END HELPER COMPONENTS ---

interface PositionCardProps {
    enrichedData: EnrichedPositionData;
    onRemove: () => void;
    onRebalance: () => void;
    onSelect: () => void;
    onBurn: () => void;
}

const getPriceFromBinId = (binId: number, binStep: number, baseDecimals: number, quoteDecimals: number): number => {
    return (1.0001 ** binId) * (10 ** (baseDecimals - quoteDecimals));
};

const formatPrice = (price: number): string => {
    if (!isFinite(price)) return 'Out of Range';
    if (price > 1e12) return '> 1 Trillion';
    if (price < 1e-6 && price > 0) return '< 0.000001';
    return price.toFixed(6);
};

export const PositionCard: React.FC<PositionCardProps> = ({ enrichedData, onRemove, onRebalance, onSelect, onBurn }) => {
    const { position, poolDetails, baseToken, quoteToken } = enrichedData;
    const totalLiquidity = position.liquidityShares.reduce((acc, current) => acc + BigInt(current), BigInt(0));
    
    let status: 'Active' | 'Inactive' | 'Empty' = 'Inactive';
    let statusColor = '#FFA500'; 
    
    if (totalLiquidity === BigInt(0)) {
        status = 'Empty';
        statusColor = '#888888';
    } else if (poolDetails.activeId >= position.lowerBinId && poolDetails.activeId <= position.upperBinId) {
        status = 'Active';
        statusColor = '#22C55E';
    }

    const minPrice = getPriceFromBinId(position.lowerBinId, poolDetails.binStep, baseToken.decimals, quoteToken.decimals);
    const maxPrice = getPriceFromBinId(position.upperBinId, poolDetails.binStep, baseToken.decimals, quoteToken.decimals);

    const isActionDisabled = status === 'Empty';
    const disabledTooltip = isActionDisabled ? 'Cannot perform actions on an empty position' : undefined;

    const buttonStyle: React.CSSProperties = {
        flex: 1, padding: '8px', cursor: 'pointer',
        border: 'none', borderRadius: '4px', color: 'white',
    };

    return (
        <div style={{ border: '1px solid #444', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#1e1e1e' }}>
            <div onClick={onSelect} style={{ padding: '15px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <PairLogos baseToken={baseToken} quoteToken={quoteToken} />
                        <h4 style={{ margin: 0 }}>{baseToken.symbol} / {quoteToken.symbol}</h4>
                    </div>
                    <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', color: 'white', backgroundColor: statusColor }}>
                        {status}
                    </span>
                </div>
                <div style={{ fontSize: '14px', color: '#aaa' }}>
                    <p style={{ margin: '4px 0' }}><strong>Price Range:</strong> {formatPrice(minPrice)} - {formatPrice(maxPrice)}</p>
                    <p style={{ margin: '4px 0' }}><strong>Bin IDs:</strong> {position.lowerBinId} - {position.upperBinId}</p>
                    <p style={{ margin: '4px 0' }}><strong>Liquidity Shares:</strong> {totalLiquidity.toString()}</p>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', padding: '0 15px 15px 15px', marginTop: 'auto' }}>
                <button onClick={onRebalance} style={{ ...buttonStyle, background: '#3a76f7', ...(isActionDisabled && { opacity: 0.5, cursor: 'not-allowed' }) }} disabled={isActionDisabled} title={disabledTooltip}>Rebalance</button>
                <button onClick={onRemove} style={{ ...buttonStyle, background: '#c93c3c', ...(isActionDisabled && { opacity: 0.5, cursor: 'not-allowed' }) }} disabled={isActionDisabled} title={disabledTooltip}>Remove</button>
                {status === 'Empty' && (
                     <button onClick={onBurn} style={{ ...buttonStyle, background: '#555' }} title="Permanently burn this empty position NFT">Burn</button>
                )}
            </div>
        </div>
    );
};