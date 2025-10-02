// src/components/AddLiquidity.tsx
import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Keypair, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { LiquidityBookServices, LiquidityShape } from '@saros-finance/dlmm-sdk';
import { createUniformDistribution } from '@saros-finance/dlmm-sdk/utils';
import { getIdFromPrice } from '@saros-finance/dlmm-sdk/utils/price';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CircleCheck, AlertTriangle } from 'lucide-react';
import { CopyButton } from './ui/CopyButton';

type LogEntry = {
    type: 'loading' | 'success' | 'error';
    message: string;
    signature?: string | null;
};

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
    const { connection } = useConnection();
    const { sendTransaction } = useWallet();

    const [amountA, setAmountA] = useState('');
    const [amountB, setAmountB] = useState('');
    const [minPrice, setMinPrice] = useState('');
    const [maxPrice, setMaxPrice] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [baseTokenBalance, setBaseTokenBalance] = useState<string | null>(null);
    const [quoteTokenBalance, setQuoteTokenBalance] = useState<string | null>(null);
    const [usePreflightCheck, setUsePreflightCheck] = useState(true);
    const [rangePercentage, setRangePercentage] = useState<number>(10);
    const [isAmountAInvalid, setIsAmountAInvalid] = useState(false);
    const [isAmountBInvalid, setIsAmountBInvalid] = useState(false);
    const [feedbackLog, setFeedbackLog] = useState<LogEntry[]>([]);

    useEffect(() => {
        const fetchBalances = async () => {
            if (!userPublicKey) return;
            setBaseTokenBalance(null);
            setQuoteTokenBalance(null);
            
            const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(userPublicKey, { programId: TOKEN_PROGRAM_ID });
            
            const findBalance = (mint: string, isBase: boolean) => {
                if (mint === 'So11111111111111111111111111111111111111112') { // Wrapped SOL
                    connection.getBalance(userPublicKey).then(solBalance => {
                        const availableSol = Math.max(0, (solBalance / LAMPORTS_PER_SOL) - 0.01);
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
    
    useEffect(() => {
        if (!price || price <= 0) return;
        const percentDecimal = rangePercentage / 100;
        const newMin = price * (1 - percentDecimal);
        const newMax = price * (1 + percentDecimal);
        setMinPrice(newMin.toFixed(quoteTokenInfo.decimals));
        setMaxPrice(newMax.toFixed(quoteTokenInfo.decimals));
    }, [rangePercentage, price, quoteTokenInfo.decimals]);

    const toLamports = (amountStr: string, decimals: number): bigint => {
        if (!amountStr) return BigInt(0);
        let [integer, fraction = ''] = amountStr.split('.');
        fraction = fraction.substring(0, decimals).padEnd(decimals, '0');
        return BigInt(integer + fraction);
    };

    const handleAmountChange = (value: string, balance: string | null, setAmount: (val: string) => void, setInvalid: (val: boolean) => void) => {
        setAmount(value);
        setInvalid(!!balance && !!value && parseFloat(value) > parseFloat(balance));
    };

    const handlePriceInputBlur = (value: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
        if (value) setter(Number(value).toFixed(quoteTokenInfo.decimals));
    };

    const updateLog = (type: LogEntry['type'], message: string, signature: string | null = null) => {
        setFeedbackLog(prev => {
            const newLog = [...prev];
            if (newLog.length > 0 && newLog[newLog.length - 1].type === 'loading') {
                newLog[newLog.length - 1].type = 'success';
            }
            newLog.push({ type, message, signature });
            return newLog;
        });
    };

    const handleAddLiquidity = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        setFeedbackLog([]);
        
        if (!userPublicKey) {
            updateLog('error', "Wallet not connected.");
            return;
        }
        if (isAmountAInvalid || isAmountBInvalid) {
            updateLog('error', "Cannot add more liquidity than you have in your balance.");
            return;
        }

        setIsSubmitting(true);
        updateLog('loading', 'Starting process...');
        let signature1 = '', finalSignature = '';

        try {
            if (!amountA || !amountB || !minPrice || !maxPrice || Number(minPrice) <= 0 || Number(maxPrice) <= 0) {
                throw new Error("Please fill all fields with valid numbers.");
            }
            if (Number(minPrice) >= Number(maxPrice)) {
                throw new Error("Min Price must be strictly less than Max Price.");
            }
            
            updateLog('loading', 'Calculating parameters...');
            const lowerBinId = getIdFromPrice(Number(minPrice), binStep, baseTokenInfo.decimals, quoteTokenInfo.decimals);
            const upperBinId = getIdFromPrice(Number(maxPrice), binStep, baseTokenInfo.decimals, quoteTokenInfo.decimals);
            const lowerBinArrayIndex = Math.floor(lowerBinId / 256);
            const upperBinArrayIndex = Math.floor(upperBinId / 256);
            
            if (usePreflightCheck && lowerBinArrayIndex === upperBinArrayIndex) {
                throw new Error("Pre-flight Check FAILED: Your price range is too narrow. This would cause an on-chain error. Please select a wider range.");
            }
            
            updateLog('loading', 'Step 1/2: Creating position...');
            const positionMint = Keypair.generate();
            const pairPubKey = new PublicKey(poolAddress);
            const transaction1 = new Transaction();
            await sdk.getBinArray({ binArrayIndex: lowerBinArrayIndex, pair: pairPubKey, payer: userPublicKey, transaction: transaction1 });
            await sdk.createPosition({ 
                pair: pairPubKey, payer: userPublicKey, 
                relativeBinIdLeft: lowerBinId - activeId, 
                relativeBinIdRight: upperBinId - activeId, 
                binArrayIndex: lowerBinArrayIndex, 
                positionMint: positionMint.publicKey, transaction: transaction1 
            });

            const { blockhash: blockhash1, lastValidBlockHeight: lastValidBlockHeight1 } = await connection.getLatestBlockhash();
            transaction1.recentBlockhash = blockhash1;
            transaction1.feePayer = userPublicKey;
            signature1 = await sendTransaction(transaction1, connection, { signers: [positionMint], skipPreflight: true });
            
            const res1 = await connection.confirmTransaction({ signature: signature1, blockhash: blockhash1, lastValidBlockHeight: lastValidBlockHeight1 }, 'confirmed');
            if (res1.value.err) throw new Error(`Transaction 1 Failed On-Chain: ${JSON.stringify(res1.value.err)}`);
            
            updateLog('success', 'Transaction 1 (Create Position) successful', signature1);
            
            updateLog('loading', 'Step 2/2: Depositing liquidity...');
            const transaction2 = new Transaction();
            await sdk.addLiquidityIntoPosition({
                positionMint: positionMint.publicKey, payer: userPublicKey, pair: pairPubKey, transaction: transaction2,
                liquidityDistribution: createUniformDistribution({ shape: LiquidityShape.Spot, binRange: [lowerBinId, upperBinId] }),
                amountX: Number(toLamports(amountA, baseTokenInfo.decimals)),
                amountY: Number(toLamports(amountB, quoteTokenInfo.decimals)),
                binArrayLower: await sdk.getBinArray({ binArrayIndex: lowerBinArrayIndex, pair: pairPubKey }),
                binArrayUpper: await sdk.getBinArray({ binArrayIndex: upperBinArrayIndex, pair: pairPubKey })
            });
            
            updateLog('loading', 'Please approve final deposit...');
            const { blockhash: blockhash2, lastValidBlockHeight: lastValidBlockHeight2 } = await connection.getLatestBlockhash();
            transaction2.recentBlockhash = blockhash2;
            transaction2.feePayer = userPublicKey;
            finalSignature = await sendTransaction(transaction2, connection, { skipPreflight: true });
            
            updateLog('loading', 'Waiting for final confirmation...');
            const res2 = await connection.confirmTransaction({ signature: finalSignature, blockhash: blockhash2, lastValidBlockHeight: lastValidBlockHeight2 }, 'confirmed');
            if (res2.value.err) throw new Error(`Transaction 2 Failed On-Chain: ${JSON.stringify(res2.value.err)}`);
            
            updateLog('success', '🏆 Success! Liquidity added.', finalSignature);
            onLiquidityAdded(); 
            
        } catch (error: any) {
            console.error("--- TRANSACTION FAILED ---", error);
            updateLog('error', `Error: ${error.message}`, finalSignature || signature1);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getIconForType = (type: LogEntry['type']) => {
        switch (type) {
            case 'loading': return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
            case 'success': return <CircleCheck className="h-5 w-5 text-green-500" />;
            case 'error': return <AlertTriangle className="h-5 w-5 text-red-500" />;
        }
    };

    return (
        <Card className="w-full max-w-2xl mx-auto">
            <form onSubmit={handleAddLiquidity}>
                <CardHeader>
                    <CardTitle>Add New Liquidity</CardTitle>
                    <CardDescription>Deposit tokens to create a new liquidity position.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <h4 className="font-semibold text-sm">1. Enter Amounts</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs font-medium">{baseTokenInfo.symbol} Amount</label>
                                    <span className="text-xs text-muted-foreground">Balance: {baseTokenBalance ?? '...'}</span>
                                </div>
                                <div className="flex">
                                    <Input type="number" value={amountA} onChange={(e) => handleAmountChange(e.target.value, baseTokenBalance, setAmountA, setIsAmountAInvalid)} placeholder="0.0" className={`rounded-r-none ${isAmountAInvalid ? 'border-destructive' : ''}`} />
                                    <Button type="button" variant="outline" onClick={() => handleAmountChange(baseTokenBalance || '0', baseTokenBalance, setAmountA, setIsAmountAInvalid)} className="rounded-l-none">Max</Button>
                                </div>
                                {isAmountAInvalid && <p className="text-xs text-destructive mt-1">Amount exceeds balance</p>}
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs font-medium">{quoteTokenInfo.symbol} Amount</label>
                                    <span className="text-xs text-muted-foreground">Balance: {quoteTokenBalance ?? '...'}</span>
                                </div>
                                <div className="flex">
                                    <Input type="number" value={amountB} onChange={(e) => handleAmountChange(e.target.value, quoteTokenBalance, setAmountB, setIsAmountBInvalid)} placeholder="0.0" className={`rounded-r-none ${isAmountBInvalid ? 'border-destructive' : ''}`} />
                                    <Button type="button" variant="outline" onClick={() => handleAmountChange(quoteTokenBalance || '0', quoteTokenBalance, setAmountB, setIsAmountBInvalid)} className="rounded-l-none">Max</Button>
                                </div>
                                {isAmountBInvalid && <p className="text-xs text-destructive mt-1">Amount exceeds balance</p>}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h4 className="font-semibold text-sm">2. Set Price Range</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-medium">Min Price ({quoteTokenInfo.symbol} per {baseTokenInfo.symbol})</label>
                                <Input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} onBlur={(e) => handlePriceInputBlur(e.target.value, setMinPrice)} placeholder="0.0" />
                            </div>
                            <div>
                                <label className="text-xs font-medium">Max Price ({quoteTokenInfo.symbol} per {baseTokenInfo.symbol})</label>
                                <Input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} onBlur={(e) => handlePriceInputBlur(e.target.value, setMaxPrice)} placeholder="0.0" />
                            </div>
                        </div>
                        <div className="pt-4">
                            <label className="text-xs text-muted-foreground">Set range around current price (+/- {rangePercentage}%)</label>
                            <Slider value={[rangePercentage]} onValueChange={(val) => setRangePercentage(val[0])} min={1} max={50} step={1} className="my-2" />
                            <div className="flex justify-center gap-2 mt-2">
                                {[1, 2, 5, 10].map(p => (
                                    <Button key={p} type="button" variant="outline" size="sm" onClick={() => setRangePercentage(p)}>+/- {p}%</Button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h4 className="font-semibold text-sm">3. Options</h4>
                        <div className="flex items-start space-x-3 rounded-md border p-3">
                            <Checkbox id="preflight-check" checked={usePreflightCheck} onCheckedChange={(checked) => setUsePreflightCheck(!!checked)} />
                            <div className="grid gap-1.5 leading-none">
                                <label htmlFor="preflight-check" className="text-sm font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    Enable Pre-flight Check (Recommended)
                                </label>
                                <p className="text-xs text-muted-foreground">
                                    Prevents on-chain errors for very narrow price ranges.
                                </p>
                            </div>
                        </div>
                    </div>

                    {feedbackLog.length > 0 && (
                        <div className="space-y-3 rounded-md border p-4">
                            {feedbackLog.map((log, index) => (
                                <div key={index} className="flex items-start gap-3 text-sm">
                                    <div className="mt-0.5 shrink-0">{getIconForType(log.type)}</div>
                                    <div className="flex-1 overflow-hidden">
                                        <p className={`font-medium ${log.type === 'error' ? 'text-destructive' : ''}`}>{log.message}</p>
                                        {log.signature && (
                                            <div className="flex items-center gap-1 mt-1 font-mono text-xs text-muted-foreground bg-muted p-1 rounded-md">
                                                <span className="truncate">{log.signature}</span>
                                                <CopyButton textToCopy={log.signature} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    <Button type="submit" disabled={isSubmitting} className="w-full">
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : 'Add Liquidity'}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}