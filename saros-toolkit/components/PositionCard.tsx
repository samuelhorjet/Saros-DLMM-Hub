"use client";
import React from 'react';
import { TokenInfo } from '@/utils/token';
import { EnrichedPositionData } from '@/app/(dashboard)/positions/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MinusCircle, RefreshCw, Trash2 } from 'lucide-react';

// --- HELPER COMPONENTS FOR LOGOS (from original file) ---
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
    <div className="flex items-center">
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
    if (!isFinite(price) || price > 1e12) return '∞';
    if (price < 1e-6 && price > 0) return '< 0.000001';
    return price.toLocaleString(undefined, { maximumFractionDigits: 6 });
};

export const PositionCard: React.FC<PositionCardProps> = ({ enrichedData, onRemove, onRebalance, onSelect, onBurn }) => {
    const { position, poolDetails, baseToken, quoteToken } = enrichedData;
    const totalLiquidity = position.liquidityShares.reduce((acc, current) => acc + BigInt(current), BigInt(0));
    
    let status: 'Active' | 'Out of Range' | 'Empty' = 'Out of Range';
    let statusVariant: "default" | "secondary" | "destructive" = "secondary";
    
    if (totalLiquidity === BigInt(0)) {
        status = 'Empty';
        statusVariant = "destructive";
    } else if (poolDetails.activeId >= position.lowerBinId && poolDetails.activeId <= position.upperBinId) {
        status = 'Active';
        statusVariant = "default";
    }

    const minPrice = getPriceFromBinId(position.lowerBinId, poolDetails.binStep, baseToken.decimals, quoteToken.decimals);
    const maxPrice = getPriceFromBinId(position.upperBinId, poolDetails.binStep, baseToken.decimals, quoteToken.decimals);

    const isActionDisabled = status === 'Empty';

    return (
        <Card className="flex flex-col justify-between transition-all hover:border-primary/50">
            <div onClick={onSelect} className="cursor-pointer">
                <CardHeader className="flex-row items-center justify-between pb-2">
                    <div className="flex items-center gap-3">
                        <PairLogos baseToken={baseToken} quoteToken={quoteToken} />
                        <CardTitle className="text-lg">{baseToken.symbol} / {quoteToken.symbol}</CardTitle>
                    </div>
                    <Badge variant={statusVariant}>{status}</Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Price Range</span>
                        <span className="font-mono">{formatPrice(minPrice)} - {formatPrice(maxPrice)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Bin IDs</span>
                        <span className="font-mono">{position.lowerBinId} - {position.upperBinId}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">Liquidity Shares</span>
                        <span className="font-mono">{totalLiquidity.toString()}</span>
                    </div>
                </CardContent>
            </div>

            <CardFooter className="grid grid-cols-2 gap-2 pt-4">
                {status === 'Empty' ? (
                     <Button onClick={onBurn} variant="destructive" className="w-full col-span-2">
                        <Trash2 className="h-4 w-4 mr-2" /> Burn NFT
                    </Button>
                ) : (
                    <>
                        <Button onClick={onRebalance} variant="outline" disabled={isActionDisabled}>
                            <RefreshCw className="h-4 w-4 mr-2" /> Rebalance
                        </Button>
                        <Button onClick={onRemove} variant="destructive" disabled={isActionDisabled}>
                            <MinusCircle className="h-4 w-4 mr-2" /> Remove
                        </Button>
                    </>
                )}
            </CardFooter>
        </Card>
    );
};