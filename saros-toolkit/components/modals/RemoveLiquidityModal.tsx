// src/components/modals/RemoveLiquidityModal.tsx
"use client";
import React, { useState, useEffect } from 'react';
import { LiquidityBookServices } from '@saros-finance/dlmm-sdk';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { EnrichedPositionData } from '@/app/positions/page';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, X, AlertTriangle, Info } from 'lucide-react';

export const RemoveLiquidityModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    sdk: LiquidityBookServices;
    positionToRemove: EnrichedPositionData | null;
    onSuccess: () => void;
}> = ({ isOpen, onClose, sdk, positionToRemove, onSuccess }) => {
    const { sendTransaction, publicKey } = useWallet();
    const [status, setStatus] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setStatus('');
            setIsProcessing(false);
        }
    }, [isOpen]);

    const handleRemove = async () => {
        if (!positionToRemove || !publicKey || !sendTransaction || !sdk.connection) return;

        setIsProcessing(true);
        setStatus('Building transaction...');
        try {
            const { position, baseToken, quoteToken, poolAddress, poolDetails } = positionToRemove;
            
            const { txs } = await sdk.removeMultipleLiquidity({
                payer: publicKey,
                pair: new PublicKey(poolAddress),
                tokenMintX: new PublicKey(baseToken.mintAddress),
                tokenMintY: new PublicKey(quoteToken.mintAddress),
                activeId: poolDetails.activeId,
                type: 'removeBoth',
                maxPositionList: [{
                    position: position.position,
                    positionMint: position.positionMint,
                    start: position.lowerBinId,
                    end: position.upperBinId,
                }],
            });

            if (txs.length === 0) throw new Error("No transactions were generated to remove liquidity.");

            const { blockhash, lastValidBlockHeight } = await sdk.connection.getLatestBlockhash();
            txs.forEach(tx => {
                tx.recentBlockhash = blockhash;
                tx.feePayer = publicKey;
            });
            
            setStatus('Please approve transaction...');
            const signature = await sendTransaction(txs[0], sdk.connection);
            
            setStatus('Waiting for confirmation...');
            await sdk.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
            
            setStatus('Success! Liquidity removed.');
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 2000);

        } catch (error: any) {
            console.error("Remove liquidity failed:", error);
            setStatus(`Error: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen || !positionToRemove) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} onClick={(e: { stopPropagation: () => any; }) => e.stopPropagation()}>
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>Remove All Liquidity</CardTitle>
                        <CardDescription>
                           You are about to withdraw 100% of the liquidity from this {positionToRemove.baseToken.symbol}/{positionToRemove.quoteToken.symbol} position.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                         <p className="text-sm font-mono break-all bg-muted p-2 rounded-md">Mint: {positionToRemove.key}</p>
                         {status && (
                            <Alert variant={status.startsWith("Error:") ? "destructive" : "default"} className="mt-4">
                               {status.startsWith("Error:") ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                                <AlertTitle>{status.startsWith("Error:") ? "Error" : "Status"}</AlertTitle>
                                <AlertDescription>{status.replace("Error:", "")}</AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                    <CardFooter className="flex justify-end gap-2">
                         <Button variant="outline" onClick={onClose} disabled={isProcessing}>Cancel</Button>
                         <Button onClick={handleRemove} disabled={isProcessing} variant="destructive">
                            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isProcessing ? 'Processing...' : `Confirm Removal`}
                        </Button>
                    </CardFooter>
                    <Button variant="ghost" size="icon" onClick={onClose} className="absolute top-4 right-4"><X className="h-4 w-4" /></Button>
                </Card>
            </motion.div>
        </div>
    );
};