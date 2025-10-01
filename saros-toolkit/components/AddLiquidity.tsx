// src/components/AddLiquidity.tsx
import React, { useEffect, useState } from 'react';
import { LiquidityBookServices, LiquidityShape } from '@saros-finance/dlmm-sdk';
import { PublicKey, Keypair, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getIdFromPrice } from '@saros-finance/dlmm-sdk/utils/price';
import { createUniformDistribution } from '@saros-finance/dlmm-sdk/utils';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

interface AddLiquidityProps {
    sdk: LiquidityBookServices;
    poolAddress: string;
    userPublicKey: PublicKey;
    baseTokenInfo: { mintAddress: string; symbol: string; decimals: number; };
    quoteTokenInfo: { mintAddress: string; symbol: string; decimals: number; };
    binStep: number;
    activeId: number;
    price: number | null;
    onLiquidityAdded: () => void;
}

export const AddLiquidity: React.FC<AddLiquidityProps> = ({ sdk, poolAddress, userPublicKey, baseTokenInfo, quoteTokenInfo, binStep, activeId, price, onLiquidityAdded }) => {
    // --- State Management ---
    const [amountA, setAmountA] = useState('');
    const [amountB, setAmountB] = useState('');
    const [minPrice, setMinPrice] = useState('');
    const [maxPrice, setMaxPrice] = useState('');
    const [status, setStatus] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [baseTokenBalance, setBaseTokenBalance] = useState<string | null>(null);
    const [quoteTokenBalance, setQuoteTokenBalance] = useState<string | null>(null);
    const [usePreflightCheck, setUsePreflightCheck] = useState(true);
    const [rangePercentage, setRangePercentage] = useState<number>(10);
    
    // State for live input validation
    const [isAmountAInvalid, setIsAmountAInvalid] = useState(false);
    const [isAmountBInvalid, setIsAmountBInvalid] = useState(false);

    const { connection } = useConnection();
    const { sendTransaction } = useWallet();

    // --- Data Fetching ---
    useEffect(() => {
        const fetchBalances = async () => {
            if (!userPublicKey) return;
            setBaseTokenBalance(null);
            setQuoteTokenBalance(null);
            
            // This is the standard SPL Token Program ID
            const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
            
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(userPublicKey, { programId: TOKEN_PROGRAM_ID });
            
            const findBalance = (mint: string, isBase: boolean) => {
                if (mint === 'So11111111111111111111111111111111111111112') {
                    connection.getBalance(userPublicKey).then(solBalance => {
                        const availableSol = Math.max(0, (solBalance / LAMPORTS_PER_SOL) - 0.01); // Leave a little for gas
                        isBase ? setBaseTokenBalance(availableSol.toFixed(6)) : setQuoteTokenBalance(availableSol.toFixed(6));
                    });
                } else {
                    const account = tokenAccounts.value.find(acc => acc.account.data.parsed.info.mint === mint);
                    const balance = account ? account.account.data.parsed.info.tokenAmount.uiAmountString : '0.0';
                    isBase ? setBaseTokenBalance(balance) : setQuoteTokenBalance(balance);
                }
            };
            findBalance(baseTokenInfo.mintAddress, true);
            findBalance(quoteTokenInfo.mintAddress, false);
        };
        fetchBalances();
    }, [userPublicKey, baseTokenInfo, quoteTokenInfo, connection]);
    
    // --- UI Synchronization ---
    // Syncs the price inputs whenever the slider or percentage buttons are changed.
    useEffect(() => {
        if (!price || price <= 0) return;
        const percentDecimal = rangePercentage / 100;
        const newMin = price * (1 - percentDecimal);
        const newMax = price * (1 + percentDecimal);
        setMinPrice(newMin.toFixed(quoteTokenInfo.decimals));
        setMaxPrice(newMax.toFixed(quoteTokenInfo.decimals));
    }, [rangePercentage, price, quoteTokenInfo.decimals]);

    // --- Helper Functions ---
    const toLamports = (amountStr: string, decimals: number): bigint => {
        if (!amountStr) return BigInt(0);
        let [integer, fraction = ''] = amountStr.split('.');
        if (fraction.length > decimals) { fraction = fraction.substring(0, decimals); }
        fraction = fraction.padEnd(decimals, '0');
        return BigInt(integer + fraction);
    };

    // --- Event Handlers ---
    const handleAmountAChange = (value: string) => {
        setAmountA(value);
        if (baseTokenBalance && parseFloat(value) > parseFloat(baseTokenBalance)) {
            setIsAmountAInvalid(true);
        } else {
            setIsAmountAInvalid(false);
        }
    };
    
    const handleAmountBChange = (value: string) => {
        setAmountB(value);
        if (quoteTokenBalance && parseFloat(value) > parseFloat(quoteTokenBalance)) {
            setIsAmountBInvalid(true);
        } else {
            setIsAmountBInvalid(false);
        }
    };

    const handlePriceInputBlur = (value: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
        if (value) {
            setter(Number(value).toFixed(quoteTokenInfo.decimals));
        }
    };

    /**
     * This is the main function for adding liquidity. It follows a robust two-transaction process.
     * 1. Transaction 1: Creates the Position NFT. This requires passing bin IDs relative to the active bin.
     * 2. Transaction 2: Deposits the tokens into the newly created position.
     * A pre-flight check is included to prevent an on-chain error if the user's price range is too narrow.
     */
    const handleAddLiquidity = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        if (!userPublicKey) { setStatus("Error: Wallet not connected."); return; }
        if (isAmountAInvalid || isAmountBInvalid) { setStatus("Error: Cannot add more liquidity than you have in your balance."); return; }
        setIsSubmitting(true);
        setStatus('Starting process...');

        let signature1 = '', finalSignature = '';

        try {
            if (!amountA || !amountB || !minPrice || !maxPrice || Number(minPrice) <= 0 || Number(maxPrice) <= 0) {
                throw new Error("Please fill all fields with valid numbers.");
            }
            if (Number(minPrice) >= Number(maxPrice)) {
                throw new Error("Min Price must be strictly less than Max Price.");
            }
            setStatus('Calculating parameters...');
            const lowerBinId = getIdFromPrice(Number(minPrice), binStep, baseTokenInfo.decimals, quoteTokenInfo.decimals);
            const upperBinId = getIdFromPrice(Number(maxPrice), binStep, baseTokenInfo.decimals, quoteTokenInfo.decimals);
            
            // This check is necessary to prevent the "Account already borrowed" error in Transaction 2,
            // which occurs if both the lower and upper price bins fall into the same on-chain BinArray account.
            const lowerBinArrayIndex = Math.floor(lowerBinId / 256);
            const upperBinArrayIndex = Math.floor(upperBinId / 256);
            if (usePreflightCheck && lowerBinArrayIndex === upperBinArrayIndex) {
                throw new Error("Pre-flight Check FAILED: Your price range is too narrow. This would cause an on-chain error. Please select a wider range.");
            }
            
            // The `createPosition` instruction requires bin IDs to be relative to the pool's active bin.
            const relativeBinIdLeft = lowerBinId - activeId;
            const relativeBinIdRight = upperBinId - activeId;

            const amountX_BigInt = toLamports(amountA, baseTokenInfo.decimals);
            const amountY_BigInt = toLamports(amountB, quoteTokenInfo.decimals);
            const positionMint = Keypair.generate();
            const pairPubKey = new PublicKey(poolAddress);

            setStatus('Step 1/2: Creating position...');
            const transaction1 = new Transaction();
            await sdk.getBinArray({ binArrayIndex: lowerBinArrayIndex, pair: pairPubKey, payer: userPublicKey, transaction: transaction1 });
            
            await sdk.createPosition({ 
                pair: pairPubKey, payer: userPublicKey, 
                relativeBinIdLeft, 
                relativeBinIdRight, 
                binArrayIndex: lowerBinArrayIndex, 
                positionMint: positionMint.publicKey, transaction: transaction1 
            });

            const { blockhash: blockhash1, lastValidBlockHeight: lastValidBlockHeight1 } = await connection.getLatestBlockhash();
            transaction1.recentBlockhash = blockhash1; transaction1.feePayer = userPublicKey;

            // `skipPreflight` is used here because this is a complex transaction that wallet simulations often fail on.
            signature1 = await sendTransaction(transaction1, connection, { signers: [positionMint], skipPreflight: true });
            
            const res1 = await connection.confirmTransaction({ signature: signature1, blockhash: blockhash1, lastValidBlockHeight: lastValidBlockHeight1 }, 'confirmed');
            if (res1.value.err) { throw new Error(`Transaction 1 Failed On-Chain: ${JSON.stringify(res1.value.err)}`); }
            console.log("✅ Transaction 1 (Create Position) successful:", signature1);

            setStatus('Step 2/2: Depositing liquidity...');
            const transaction2 = new Transaction();
            const liquidityDistribution = createUniformDistribution({ shape: LiquidityShape.Spot, binRange: [lowerBinId, upperBinId] });

            await sdk.addLiquidityIntoPosition({
                positionMint: positionMint.publicKey,
                payer: userPublicKey,
                pair: pairPubKey,
                transaction: transaction2,
                liquidityDistribution,
                amountX: Number(amountX_BigInt),
                amountY: Number(amountY_BigInt),
                binArrayLower: await sdk.getBinArray({ binArrayIndex: lowerBinArrayIndex, pair: pairPubKey }),
                binArrayUpper: await sdk.getBinArray({ binArrayIndex: upperBinArrayIndex, pair: pairPubKey })
            });

            const { blockhash: blockhash2, lastValidBlockHeight: lastValidBlockHeight2 } = await connection.getLatestBlockhash();
            transaction2.recentBlockhash = blockhash2; transaction2.feePayer = userPublicKey;
            
            setStatus("Please approve final deposit...");
            finalSignature = await sendTransaction(transaction2, connection, { skipPreflight: true });
            
            setStatus("Waiting for final confirmation...");
            const res2 = await connection.confirmTransaction({ signature: finalSignature, blockhash: blockhash2, lastValidBlockHeight: lastValidBlockHeight2 }, 'confirmed');
            if (res2.value.err) { throw new Error(`Transaction 2 Failed On-Chain: ${JSON.stringify(res2.value.err)}`); }
            
            setStatus(`🏆 Success! Liquidity added. Final signature: ${finalSignature}`);

            // This is the auto-refresh trigger!
            onLiquidityAdded(); 
            
        } catch (error: any) {
            console.error("--- TRANSACTION FAILED ---", error);
            let errorMessage = `Error: ${error.message}`;
            if(finalSignature) errorMessage += ` (Signature: ${finalSignature})`
            else if(signature1) errorMessage += ` (Signature: ${signature1})`
            setStatus(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Component Render ---
    return (
        <div style={{ border: '1px solid #444', padding: '15px', borderRadius: '5px', marginTop: '20px' }}>
            <h4>Add New Liquidity</h4>
            <form onSubmit={handleAddLiquidity}>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '15px' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label>{baseTokenInfo.symbol} Amount</label>
                            <span style={{ fontSize: '12px', color: '#888' }}>Balance: {baseTokenBalance ?? '...'}</span>
                        </div>
                        <div style={{ display: 'flex' }}>
                            <input type="number" value={amountA} onChange={(e) => handleAmountAChange(e.target.value)} placeholder="0.0" style={{...inputStyle, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderColor: isAmountAInvalid ? 'red' : '#444' }} />
                            <button type="button" onClick={() => handleAmountAChange(baseTokenBalance || '0')} style={{...buttonStyle, width: 'auto', padding: '0 10px', borderTopLeftRadius: 0, borderBottomLeftRadius: 0}}>Max</button>
                        </div>
                        {isAmountAInvalid && <p style={{ fontSize: '12px', color: 'red', margin: '5px 0 0 0' }}>Amount exceeds balance</p>}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label>{quoteTokenInfo.symbol} Amount</label>
                            <span style={{ fontSize: '12px', color: '#888' }}>Balance: {quoteTokenBalance ?? '...'}</span>
                        </div>
                        <div style={{ display: 'flex' }}>
                             <input type="number" value={amountB} onChange={(e) => handleAmountBChange(e.target.value)} placeholder="0.0" style={{...inputStyle, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderColor: isAmountBInvalid ? 'red' : '#444' }} />
                            <button type="button" onClick={() => handleAmountBChange(quoteTokenBalance || '0')} style={{...buttonStyle, width: 'auto', padding: '0 10px', borderTopLeftRadius: 0, borderBottomLeftRadius: 0}}>Max</button>
                        </div>
                        {isAmountBInvalid && <p style={{ fontSize: '12px', color: 'red', margin: '5px 0 0 0' }}>Amount exceeds balance</p>}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '10px' }}>
                    <div style={{ flex: 1 }}>
                        <label>Min Price ({quoteTokenInfo.symbol} per {baseTokenInfo.symbol})</label>
                        <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} onBlur={(e) => handlePriceInputBlur(e.target.value, setMinPrice)} placeholder="0.0" style={inputStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label>Max Price ({quoteTokenInfo.symbol} per {baseTokenInfo.symbol})</label>
                        <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} onBlur={(e) => handlePriceInputBlur(e.target.value, setMaxPrice)} placeholder="0.0" style={inputStyle} />
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
                
                <div style={{ marginBottom: '20px', padding: '10px', border: '1px solid #555', borderRadius: '5px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input type="checkbox" checked={usePreflightCheck} onChange={(e) => setUsePreflightCheck(e.target.checked)} style={{ marginRight: '10px' }} />
                        Enable Pre-flight Check (Recommended)
                    </label>
                    <p style={{ fontSize: '12px', color: '#888', margin: '5px 0 0 0' }}>
                        Disabling this lets you send transactions with a narrow price range to demonstrate the on-chain "already borrowed" bug.
                    </p>
                </div>

                <button type="submit" disabled={isSubmitting} style={buttonStyle}>
                    {isSubmitting ? 'Processing...' : 'Add Liquidity'}
                </button>
                {status && <p style={{ marginTop: '15px' }}>Status: {status}</p>}
            </form>
        </div>
    );
};

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px', marginTop: '5px', background: '#222', border: '1px solid #444', borderRadius: '4px', color: 'white', };
const buttonStyle: React.CSSProperties = { width: '100%', padding: '10px', background: '#3a76f7', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', };