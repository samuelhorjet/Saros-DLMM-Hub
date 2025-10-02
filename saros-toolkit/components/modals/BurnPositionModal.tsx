// src/components/modals/BurnPositionModal.tsx
"use client";
import React, { useState, useEffect } from 'react';
import { LiquidityBookServices } from '@saros-finance/dlmm-sdk';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { EnrichedPositionData } from '@/app/positions/page';
import { Program, Idl } from '@coral-xyz/anchor';
import liquidityBookIdl from '../../idl/liquidity_book.json';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, X, AlertTriangle, Info, Trash2 } from 'lucide-react';

export const BurnPositionModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    sdk: LiquidityBookServices;
    positionToBurn: EnrichedPositionData | null;
    onSuccess: () => void;
}> = ({ isOpen, onClose, sdk, positionToBurn, onSuccess }) => {
    const { sendTransaction, publicKey } = useWallet();
    const [status, setStatus] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setStatus('');
            setIsProcessing(false);
        }
    }, [isOpen]);

    const handleBurn = async () => {
        if (!positionToBurn || !publicKey || !sendTransaction) return;

        setIsProcessing(true);
        setStatus('Building transaction to burn NFT...');
        try {
            // @ts-ignore
            if (!sdk.provider) throw new Error("SDK provider not initialized.");
            
            // @ts-ignore
            const program = new Program(liquidityBookIdl as Idl, new PublicKey(liquidityBookIdl.address), sdk.provider);

            const { position, poolAddress, key } = positionToBurn;
            
            const [binArrayLowerPda] = PublicKey.findProgramAddressSync([Buffer.from("bin_array"), new PublicKey(poolAddress).toBuffer(), Buffer.from([Math.floor(position.lowerBinId / 256)])], program.programId);
            const [binArrayUpperPda] = PublicKey.findProgramAddressSync([Buffer.from("bin_array"), new PublicKey(poolAddress).toBuffer(), Buffer.from([Math.floor(position.upperBinId / 256)])], program.programId);
            
            const instruction = await program.methods.closePosition().accounts({
                pair: new PublicKey(poolAddress),
                position: new PublicKey(position.position),
                positionMint: new PublicKey(key),
                binArrayLower: binArrayLowerPda,
                binArrayUpper: binArrayUpperPda,
                user: publicKey,
            }).instruction();

            const tx = new Transaction().add(instruction);
            const { blockhash, lastValidBlockHeight } = await sdk.connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;
            tx.feePayer = publicKey;
            
            setStatus('Please approve the transaction...');
            const signature = await sendTransaction(tx, sdk.connection);
            
            setStatus('Waiting for confirmation...');
            await sdk.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
            
            setStatus('Success! Position NFT has been burned.');
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 2000);

        } catch (error: any) {
            console.error("Burn position failed:", error);
            setStatus(`Error: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen || !positionToBurn) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} onClick={(e: { stopPropagation: () => any; }) => e.stopPropagation()}>
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-destructive" /> Burn Position</CardTitle>
                        <CardDescription>
                            This will permanently burn the Position NFT and close its on-chain account. This action is irreversible.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                         <p className="text-sm font-mono break-all bg-muted p-2 rounded-md">Mint: {positionToBurn.key}</p>
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
                         <Button onClick={handleBurn} disabled={isProcessing} variant="destructive">
                            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isProcessing ? 'Burning...' : `Confirm and Burn`}
                        </Button>
                    </CardFooter>
                    <Button variant="ghost" size="icon" onClick={onClose} className="absolute top-4 right-4"><X className="h-4 w-4" /></Button>
                </Card>
            </motion.div>
        </div>
    );
};