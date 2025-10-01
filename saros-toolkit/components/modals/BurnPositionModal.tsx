// src/components/modals/BurnPositionModal.tsx
"use client";
import React, { useState, useEffect } from 'react';
import { LiquidityBookServices } from '@saros-finance/dlmm-sdk';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { EnrichedPositionData } from '@/app/positions/page';
import { Program, Idl } from '@coral-xyz/anchor';
import liquidityBookIdl from '../../idl/liquidity_book.json';

// Reusable styles
const modalOverlayStyle: React.CSSProperties = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.75)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modalContentStyle: React.CSSProperties = { background: "#1a1a1a", padding: "25px", borderRadius: "8px", width: "90%", maxWidth: "600px", maxHeight: "90vh", overflowY: "auto", position: "relative", border: "1px solid #444" };
const closeButtonStyle: React.CSSProperties = { position: "absolute", top: "10px", right: "15px", background: "transparent", border: "none", color: "white", fontSize: "24px", cursor: "pointer" };

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

        const totalLiquidity = positionToBurn.position.liquidityShares.reduce((acc, current) => acc + BigInt(current), BigInt(0));
        if (totalLiquidity > BigInt(0)) {
            setStatus("Error: Cannot burn a position that still contains liquidity.");
            return;
        }

        setIsProcessing(true);
        setStatus('Building transaction to burn NFT...');
        try {
            // FIX: Use the provider from the correctly initialized SDK instance.
            // @ts-ignore - The 'provider' property might not be in the public type definitions, but it exists.
            if (!sdk.provider) {
                throw new Error("SDK provider not initialized. Please ensure the SDK is created correctly on the parent page.");
            }
            // @ts-ignore
            const program = new Program(liquidityBookIdl as Idl, new PublicKey(liquidityBookIdl.address), sdk.provider);

            const { position, poolAddress, key } = positionToBurn;
            const positionMint = new PublicKey(key);

            const [binArrayLowerPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("bin_array"), new PublicKey(poolAddress).toBuffer(), Buffer.from([Math.floor(position.lowerBinId / 256)])],
                program.programId
            );

            const [binArrayUpperPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("bin_array"), new PublicKey(poolAddress).toBuffer(), Buffer.from([Math.floor(position.upperBinId / 256)])],
                program.programId
            );
            
            const instruction = await program.methods
                .closePosition()
                .accounts({
                    pair: new PublicKey(poolAddress),
                    position: new PublicKey(position.position),
                    positionMint: positionMint,
                    binArrayLower: binArrayLowerPda,
                    binArrayUpper: binArrayUpperPda,
                    user: publicKey,
                })
                .instruction();

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
        <div style={modalOverlayStyle} onClick={onClose}>
            <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
                <button style={closeButtonStyle} onClick={onClose}>&times;</button>
                <h4>Confirm Burn Position</h4>
                <p>This will permanently burn the Position NFT and close the associated on-chain account. This action cannot be undone.</p>
                <p style={{fontSize: '12px', color: '#aaa', wordBreak: 'break-all'}}>Mint: {positionToBurn.key}</p>

                <button onClick={handleBurn} disabled={isProcessing} style={{ width: '100%', padding: '10px', marginTop: '20px', background: '#c93c_c' }}>
                    {isProcessing ? 'Burning...' : `Confirm and Burn`}
                </button>
                {status && <p style={{ marginTop: '15px' }}>{status}</p>}
            </div>
        </div>
    );
};