// src/components/modals/RebalanceModal.tsx
"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { LiquidityBookServices, LiquidityShape, createUniformDistribution } from '@saros-finance/dlmm-sdk';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { getIdFromPrice, getPriceFromId } from "@saros-finance/dlmm-sdk/utils/price";
import { EnrichedPositionData } from '@/app/positions/page';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, X, AlertTriangle, Info } from 'lucide-react';

export const RebalanceModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    sdk: LiquidityBookServices;
    positionToRebalance: EnrichedPositionData | null;
    onSuccess: () => void;
}> = ({ isOpen, onClose, sdk, positionToRebalance, onSuccess }) => {
    const { sendTransaction, publicKey } = useWallet();
    
    const [minPrice, setMinPrice] = useState('');
    const [maxPrice, setMaxPrice] = useState('');
    const [rangePercentage, setRangePercentage] = useState<number>(10);
    const [status, setStatus] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const currentPrice = useMemo(() => {
        if (!positionToRebalance) return null;
        const { poolDetails, baseToken, quoteToken } = positionToRebalance;
        return getPriceFromId(poolDetails.binStep, poolDetails.activeId, baseToken.decimals, quoteToken.decimals);
    }, [positionToRebalance]);

    useEffect(() => {
        if (isOpen) {
            setStatus('');
            setMinPrice('');
            setMaxPrice('');
            setIsProcessing(false);
            setRangePercentage(10);
        }
    }, [isOpen]);
    
    useEffect(() => {
        if (!currentPrice || currentPrice <= 0 || !positionToRebalance) return;
        const percentDecimal = rangePercentage / 100;
        const newMin = currentPrice * (1 - percentDecimal);
        const newMax = currentPrice * (1 + percentDecimal);
        const decimals = positionToRebalance.quoteToken.decimals;
        setMinPrice(newMin.toFixed(decimals));
        setMaxPrice(newMax.toFixed(decimals));
    }, [rangePercentage, currentPrice, positionToRebalance]);

    const handleRebalance = async () => {
        if (!positionToRebalance || !publicKey || !sendTransaction || !sdk.connection) return;
        if (!minPrice || !maxPrice || Number(minPrice) >= Number(maxPrice)) {
            setStatus("Error: Please set a valid new price range.");
            return;
        }

        setIsProcessing(true);
        try {
            const { position, baseToken, quoteToken, poolDetails, poolAddress } = positionToRebalance;
            const pairPubKey = new PublicKey(poolAddress);
            
            // --- Step 1: Remove all liquidity from the old position (with bug fix) ---
            setStatus('Step 1/3: Removing liquidity...');
            const { txs: removeTxs, txCreateAccount, txCloseAccount } = await sdk.removeMultipleLiquidity({
                payer: publicKey, pair: pairPubKey, tokenMintX: new PublicKey(baseToken.mintAddress),
                tokenMintY: new PublicKey(quoteToken.mintAddress), activeId: poolDetails.activeId, type: 'removeBoth',
                maxPositionList: [{ position: position.position, positionMint: position.positionMint, start: position.lowerBinId, end: position.upperBinId }],
            });

            const allRemoveTxs: Transaction[] = [];
            if (txCreateAccount) allRemoveTxs.push(txCreateAccount);
            allRemoveTxs.push(...removeTxs);
            if (txCloseAccount) allRemoveTxs.push(txCloseAccount);

            if (allRemoveTxs.length === 0) {
                 throw new Error("Failed to generate any transactions to remove liquidity.");
            }

            for (let i = 0; i < allRemoveTxs.length; i++) {
                const tx = allRemoveTxs[i];
                const statusSuffix = allRemoveTxs.length > 1 ? ` (${i + 1}/${allRemoveTxs.length})` : '';
                setStatus(`Step 1/3: Approving remove transaction${statusSuffix}...`);

                const { blockhash, lastValidBlockHeight } = await sdk.connection.getLatestBlockhash();
                tx.recentBlockhash = blockhash;
                tx.feePayer = publicKey;

                const signature = await sendTransaction(tx, sdk.connection);
                await sdk.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
            }

            // --- Step 2: Create a new position NFT in the new range ---
            setStatus('Step 2/3: Creating new position...');
            const lowerBinId = getIdFromPrice(Number(minPrice), poolDetails.binStep, baseToken.decimals, quoteToken.decimals);
            const upperBinId = getIdFromPrice(Number(maxPrice), poolDetails.binStep, baseToken.decimals, quoteToken.decimals);
            const newPositionMint = Keypair.generate();
            const createPosTx = new Transaction();
            
            await sdk.createPosition({
                pair: pairPubKey, payer: publicKey, relativeBinIdLeft: lowerBinId - poolDetails.activeId,
                relativeBinIdRight: upperBinId - poolDetails.activeId, binArrayIndex: Math.floor(lowerBinId / 256),
                positionMint: newPositionMint.publicKey, transaction: createPosTx,
            });

            const { blockhash: bh2, lastValidBlockHeight: lvh2 } = await sdk.connection.getLatestBlockhash();
            createPosTx.recentBlockhash = bh2;
            createPosTx.feePayer = publicKey;
            const sig2 = await sendTransaction(createPosTx, sdk.connection, { signers: [newPositionMint] });
            await sdk.connection.confirmTransaction({ signature: sig2, blockhash: bh2, lastValidBlockHeight: lvh2 }, 'confirmed');
            
            // --- Step 3: Deposit the withdrawn liquidity into the new position ---
            setStatus('Step 3/3: Depositing liquidity...');
            const addLiqTx = new Transaction();
            await sdk.addLiquidityIntoPosition({
                positionMint: newPositionMint.publicKey, payer: publicKey, pair: pairPubKey, transaction: addLiqTx,
                liquidityDistribution: createUniformDistribution({ shape: LiquidityShape.Spot, binRange: [lowerBinId, upperBinId] }),
                amountX: Number.MAX_SAFE_INTEGER, // Use max available wallet balance
                amountY: Number.MAX_SAFE_INTEGER, // Use max available wallet balance
                binArrayLower: await sdk.getBinArray({ binArrayIndex: Math.floor(lowerBinId / 256), pair: pairPubKey }),
                binArrayUpper: await sdk.getBinArray({ binArrayIndex: Math.floor(upperBinId / 256), pair: pairPubKey })
            });

            const { blockhash: bh3, lastValidBlockHeight: lvh3 } = await sdk.connection.getLatestBlockhash();
            addLiqTx.recentBlockhash = bh3;
            addLiqTx.feePayer = publicKey;
            const sig3 = await sendTransaction(addLiqTx, sdk.connection);
            await sdk.connection.confirmTransaction({ signature: sig3, blockhash: bh3, lastValidBlockHeight: lvh3 }, 'confirmed');
            
            setStatus('Success! Rebalance complete.');
            setTimeout(() => { onSuccess(); onClose(); }, 2000);

        } catch (error: any) {
            console.error("Rebalance failed:", error);
            setStatus(`Error: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen || !positionToRebalance) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
             <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} onClick={(e) => e.stopPropagation()}>
                <Card className="w-full max-w-lg">
                    <CardHeader>
                        <CardTitle>Rebalance Position</CardTitle>
                        <CardDescription>Withdraw all liquidity and redeposit it into a new price range.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-medium">New Min Price ({positionToRebalance.quoteToken.symbol})</label>
                                <Input type="number" value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="0.0" />
                            </div>
                            <div>
                                <label className="text-xs font-medium">New Max Price ({positionToRebalance.quoteToken.symbol})</label>
                                <Input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="0.0" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground">Set range around current price (+/- {rangePercentage}%)</label>
                            <Slider value={[rangePercentage]} onValueChange={(val) => setRangePercentage(val[0])} min={1} max={50} step={1} className="my-2" />
                            <div className="flex justify-center gap-2">
                                {[1, 5, 10, 25].map(p => (
                                    <Button key={p} type="button" variant="outline" size="sm" onClick={() => setRangePercentage(p)}>+/- {p}%</Button>
                                ))}
                            </div>
                        </div>
                         {status && (
                            <Alert variant={status.startsWith("Error:") ? "destructive" : "default"} className="mt-4">
                               {status.startsWith("Error:") ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                                <AlertTitle>{status.startsWith("Error:") ? "Error" : "Status"}</AlertTitle>
                                <AlertDescription className="break-all">{status.replace("Error:", "")}</AlertDescription>
                            </Alert>
                        )}
                        {isProcessing && <p className="text-xs text-muted-foreground text-center">This multi-step process may require several wallet approvals.</p>}
                    </CardContent>
                    <CardFooter className="flex justify-end gap-2">
                        <Button variant="outline" onClick={onClose} disabled={isProcessing}>Cancel</Button>
                        <Button onClick={handleRebalance} disabled={isProcessing}>
                            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isProcessing ? 'Rebalancing...' : 'Execute Rebalance'}
                        </Button>
                    </CardFooter>
                     <Button variant="ghost" size="icon" onClick={onClose} className="absolute top-4 right-4"><X className="h-4 w-4" /></Button>
                </Card>
            </motion.div>
        </div>
    );
};