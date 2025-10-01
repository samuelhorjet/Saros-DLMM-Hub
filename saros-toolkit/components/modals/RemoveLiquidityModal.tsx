// src/components/modals/RemoveLiquidityModal.tsx
"use client";
import React, { useState, useEffect } from 'react';
import { LiquidityBookServices } from '@saros-finance/dlmm-sdk';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { EnrichedPositionData } from '@/app/positions/page';

const modalOverlayStyle: React.CSSProperties = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.75)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modalContentStyle: React.CSSProperties = { background: "#1a1a1a", padding: "25px", borderRadius: "8px", width: "90%", maxWidth: "600px", maxHeight: "90vh", overflowY: "auto", position: "relative", border: "1px solid #444" };
const closeButtonStyle: React.CSSProperties = { position: "absolute", top: "10px", right: "15px", background: "transparent", border: "none", color: "white", fontSize: "24px", cursor: "pointer" };

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
            // --- FIX: Correctly destructure all needed properties ---
            const { position, baseToken, quoteToken, poolAddress, poolDetails } = positionToRemove;
            
            const { txs, txCreateAccount, txCloseAccount } = await sdk.removeMultipleLiquidity({
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

            const allTxs: Transaction[] = [];
            if (txCreateAccount) allTxs.push(txCreateAccount);
            allTxs.push(...txs);
            if (txCloseAccount) allTxs.push(txCloseAccount);

            if (allTxs.length === 0) {
                throw new Error("No transactions were generated to remove liquidity.");
            }

            const { blockhash, lastValidBlockHeight } = await sdk.connection.getLatestBlockhash();
            allTxs.forEach(tx => {
                tx.recentBlockhash = blockhash;
                tx.feePayer = publicKey;
            });
            
            setStatus('Please approve transaction(s)...');
            const signature = await sendTransaction(allTxs[0], sdk.connection);
            
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
        <div style={modalOverlayStyle} onClick={onClose}>
            <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
                <button style={closeButtonStyle} onClick={onClose}>&times;</button>
                <h4>Remove 100% of Liquidity</h4>
                <p>From: {positionToRemove.baseToken.symbol}/{positionToRemove.quoteToken.symbol} Position</p>
                <p style={{fontSize: '12px', color: '#aaa', wordBreak: 'break-all'}}>Mint: {positionToRemove.key}</p>

                <button onClick={handleRemove} disabled={isProcessing} style={{ width: '100%', padding: '10px', marginTop: '20px' }}>
                    {isProcessing ? 'Processing...' : `Confirm Removal`}
                </button>
                {status && <p style={{ marginTop: '15px' }}>{status}</p>}
            </div>
        </div>
    );
};