// src/components/modals/RebalanceModal.tsx
"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { LiquidityBookServices, LiquidityShape, createUniformDistribution } from '@saros-finance/dlmm-sdk';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { getIdFromPrice, getPriceFromId } from "@saros-finance/dlmm-sdk/utils/price";
import { EnrichedPositionData } from '@/app/positions/page';

// Reusable styles
const modalOverlayStyle: React.CSSProperties = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.75)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const modalContentStyle: React.CSSProperties = { background: "#1a1a1a", padding: "25px", borderRadius: "8px", width: "90%", maxWidth: "600px", maxHeight: "90vh", overflowY: "auto", position: "relative", border: "1px solid #444" };
const closeButtonStyle: React.CSSProperties = { position: "absolute", top: "10px", right: "15px", background: "transparent", border: "none", color: "white", fontSize: "24px", cursor: "pointer" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px", background: "#222", border: "1px solid #444", borderRadius: "4px", color: "white" };
const buttonStyle: React.CSSProperties = { width: '100%', padding: '10px', background: '#3a76f7', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', };

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
    const [step, setStep] = useState<'input' | 'processing' | 'done'>('input');

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
            setStep('input');
            setRangePercentage(10);
        }
    }, [isOpen]);
    
    // --- NEW: Effect to sync slider with price inputs ---
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
        // ... (The handleRebalance function logic is correct and remains unchanged) ...
        // The crash was due to data passed into it, not the function itself.
        if (!positionToRebalance || !publicKey || !sendTransaction || !sdk.connection) return;
        if (!minPrice || !maxPrice || Number(minPrice) >= Number(maxPrice)) {
            setStatus("Error: Please set a valid new price range.");
            return;
        }
        setStep('processing');
        try {
            const { position, baseToken, quoteToken, poolDetails, poolAddress } = positionToRebalance;
            setStatus('Step 1/3: Removing liquidity from old position...');
            const { txs: removeTxs } = await sdk.removeMultipleLiquidity({
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
            if (removeTxs.length === 0) throw new Error("Failed to generate remove liquidity transaction.");
            const { blockhash: bh1, lastValidBlockHeight: lvh1 } = await sdk.connection.getLatestBlockhash();
            removeTxs[0].recentBlockhash = bh1;
            removeTxs[0].feePayer = publicKey;
            const sig1 = await sendTransaction(removeTxs[0], sdk.connection);
            await sdk.connection.confirmTransaction({ signature: sig1, blockhash: bh1, lastValidBlockHeight: lvh1 }, 'confirmed');
            setStatus('Step 2/3: Creating new position NFT...');
            const lowerBinId = getIdFromPrice(Number(minPrice), poolDetails.binStep, baseToken.decimals, quoteToken.decimals);
            const upperBinId = getIdFromPrice(Number(maxPrice), poolDetails.binStep, baseToken.decimals, quoteToken.decimals);
            const relativeBinIdLeft = lowerBinId - poolDetails.activeId;
            const relativeBinIdRight = upperBinId - poolDetails.activeId;
            const newPositionMint = Keypair.generate();
            const pairPubKey = new PublicKey(poolAddress);
            const createPosTx = new Transaction();
            await sdk.createPosition({
                pair: pairPubKey,
                payer: publicKey,
                relativeBinIdLeft,
                relativeBinIdRight,
                binArrayIndex: Math.floor(lowerBinId / 256),
                positionMint: newPositionMint.publicKey,
                transaction: createPosTx,
            });
            const { blockhash: bh2, lastValidBlockHeight: lvh2 } = await sdk.connection.getLatestBlockhash();
            createPosTx.recentBlockhash = bh2;
            createPosTx.feePayer = publicKey;
            const sig2 = await sendTransaction(createPosTx, sdk.connection, { signers: [newPositionMint] });
            await sdk.connection.confirmTransaction({ signature: sig2, blockhash: bh2, lastValidBlockHeight: lvh2 }, 'confirmed');
            setStatus('Step 3/3: Depositing liquidity into new position...');
            const liquidityDistribution = createUniformDistribution({ shape: LiquidityShape.Spot, binRange: [lowerBinId, upperBinId] });
            const addLiqTx = new Transaction();
            const largeAmount = BigInt("999999999999999999");
            await sdk.addLiquidityIntoPosition({
                positionMint: newPositionMint.publicKey,
                payer: publicKey,
                pair: pairPubKey,
                transaction: addLiqTx,
                liquidityDistribution,
                amountX: Number(largeAmount),
                amountY: Number(largeAmount),
                binArrayLower: await sdk.getBinArray({ binArrayIndex: Math.floor(lowerBinId / 256), pair: pairPubKey }),
                binArrayUpper: await sdk.getBinArray({ binArrayIndex: Math.floor(upperBinId / 256), pair: pairPubKey })
            });
            const { blockhash: bh3, lastValidBlockHeight: lvh3 } = await sdk.connection.getLatestBlockhash();
            addLiqTx.recentBlockhash = bh3;
            addLiqTx.feePayer = publicKey;
            const sig3 = await sendTransaction(addLiqTx, sdk.connection);
            await sdk.connection.confirmTransaction({ signature: sig3, blockhash: bh3, lastValidBlockHeight: lvh3 }, 'confirmed');
            setStatus('Success! Rebalance complete.');
            setStep('done');
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 2000);
        } catch (error: any) {
            console.error("Rebalance failed:", error);
            setStatus(`Error during rebalance: ${error.message}`);
            setStep('input');
        }
    };

    if (!isOpen || !positionToRebalance) return null;
    const { baseToken, quoteToken } = positionToRebalance;

    return (
        <div style={modalOverlayStyle} onClick={onClose}>
            <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
                <button style={closeButtonStyle} onClick={onClose}>&times;</button>
                <h4>Rebalance Position</h4>
                <p>Move liquidity for {baseToken.symbol}/{quoteToken.symbol} to a new price range.</p>
                
                {/* --- NEW UI FOR PRICE RANGE --- */}
                <div style={{ display: 'flex', gap: '20px', marginBottom: '10px', marginTop: '20px' }}>
                    <div style={{ flex: 1 }}>
                        <label>New Min Price ({quoteToken.symbol} per {baseToken.symbol})</label>
                        <input type="number" value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="0.0" style={inputStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label>New Max Price ({quoteToken.symbol} per {baseToken.symbol})</label>
                        <input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="0.0" style={inputStyle} />
                    </div>
                </div>
                <div style={{ marginBottom: '20px' }}>
                     <label style={{ fontSize: '12px', color: '#888' }}>Set price range around current price (+/- {rangePercentage}%)</label>
                    <input type="range" min="1" max="50" value={rangePercentage} onChange={(e) => setRangePercentage(Number(e.target.value))} style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '5px' }}>
                        <button type="button" onClick={() => setRangePercentage(1)} style={{...buttonStyle, width: 'auto', background: '#333'}}>+/- 1%</button>
                        <button type="button" onClick={() => setRangePercentage(2)} style={{...buttonStyle, width: 'auto', background: '#333'}}>+/- 2%</button>
                        <button type="button" onClick={() => setRangePercentage(5)} style={{...buttonStyle, width: 'auto', background: '#333'}}>+/- 5%</button>
                        <button type="button" onClick={() => setRangePercentage(10)} style={{...buttonStyle, width: 'auto', background: '#333'}}>+/- 10%</button>
                    </div>
                </div>
                {/* --- END NEW UI --- */}

                <button onClick={handleRebalance} disabled={step === 'processing'} style={{ width: '100%', padding: '10px', marginTop: '10px' }}>
                    {step === 'processing' ? 'Processing...' : 'Execute Rebalance'}
                </button>
                {status && <p style={{ marginTop: '15px', wordBreak: 'break-all' }}>Status: {status}</p>}
                {step === 'processing' && <p style={{fontSize: '12px', color: '#aaa'}}>This is a multi-step process that may require multiple wallet approvals.</p>}
            </div>
        </div>
    );
};