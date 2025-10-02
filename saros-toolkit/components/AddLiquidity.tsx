// src/components/AddLiquidity.tsx
import React, { useEffect, useState } from 'react';
import { LiquidityBookServices, LiquidityShape } from '@saros-finance/dlmm-sdk';
import { PublicKey, Keypair, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getIdFromPrice } from '@saros-finance/dlmm-sdk/utils/price';
import { createUniformDistribution } from '@saros-finance/dlmm-sdk/utils';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, Loader2, AlertTriangle } from 'lucide-react';

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
    
    const [isAmountAInvalid, setIsAmountAInvalid] = useState(false);
    const [isAmountBInvalid, setIsAmountBInvalid] = useState(false);

    const { connection } = useConnection();
    const { sendTransaction } = useWallet();

    useEffect(() => {
        const fetchBalances = async () => {
            if (!userPublicKey) return;
            setBaseTokenBalance(null);
            setQuoteTokenBalance(null);
            
            const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
            
            const findBalance = async (mint: string, isBase: boolean) => {
                if (mint === 'So11111111111111111111111111111111111111112') {
                    const solBalance = await connection.getBalance(userPublicKey);
                    const availableSol = Math.max(0, (solBalance / LAMPORTS_PER_SOL) - 0.01);
                    isBase ? setBaseTokenBalance(availableSol.toFixed(6)) : setQuoteTokenBalance(availableSol.toFixed(6));
                } else {
                    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(userPublicKey, { mint: new PublicKey(mint) });
                    const account = tokenAccounts.value[0];
                    const balance = account ? account.account.data.parsed.info.tokenAmount.uiAmountString : '0.0';
                    isBase ? setBaseTokenBalance(balance) : setQuoteTokenBalance(balance);
                }
            };
            await Promise.all([
                findBalance(baseTokenInfo.mintAddress, true),
                findBalance(quoteTokenInfo.mintAddress, false)
            ]);
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
        if (balance && parseFloat(value) > parseFloat(balance)) {
            setInvalid(true);
        } else {
            setInvalid(false);
        }
    };
    
    const handleAddLiquidity = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!userPublicKey || isAmountAInvalid || isAmountBInvalid) return;

        setIsSubmitting(true);
        setStatus('Starting process...');

        try {
            if (!amountA || !amountB || !minPrice || !maxPrice || Number(minPrice) >= Number(maxPrice)) {
                throw new Error("Please fill all fields with valid numbers and ensure Min Price is less than Max Price.");
            }

            setStatus('Calculating price bins...');
            const lowerBinId = getIdFromPrice(Number(minPrice), binStep, baseTokenInfo.decimals, quoteTokenInfo.decimals);
            const upperBinId = getIdFromPrice(Number(maxPrice), binStep, baseTokenInfo.decimals, quoteTokenInfo.decimals);
            
            const lowerBinArrayIndex = Math.floor(lowerBinId / 256);
            const upperBinArrayIndex = Math.floor(upperBinId / 256);
            if (usePreflightCheck && lowerBinArrayIndex === upperBinArrayIndex) {
                throw new Error("Price range is too narrow. This could cause an on-chain error. Please select a wider range.");
            }
            
            setStatus('Step 1/2: Creating position...');
            const positionMint = Keypair.generate();
            const pairPubKey = new PublicKey(poolAddress);

            const transaction1 = new Transaction();
            await sdk.getBinArray({ binArrayIndex: lowerBinArrayIndex, pair: pairPubKey, payer: userPublicKey, transaction: transaction1 });
            
            await sdk.createPosition({ 
                pair: pairPubKey, 
                payer: userPublicKey, 
                relativeBinIdLeft: lowerBinId - activeId, 
                relativeBinIdRight: upperBinId - activeId, 
                binArrayIndex: lowerBinArrayIndex, 
                positionMint: positionMint.publicKey, 
                transaction: transaction1 
            });

            const { blockhash: blockhash1, lastValidBlockHeight: lvh1 } = await connection.getLatestBlockhash();
            transaction1.recentBlockhash = blockhash1; 
            transaction1.feePayer = userPublicKey;

            const signature1 = await sendTransaction(transaction1, connection, { signers: [positionMint], skipPreflight: true });
            await connection.confirmTransaction({ signature: signature1, blockhash: blockhash1, lastValidBlockHeight: lvh1 }, 'confirmed');
            
            setStatus('Step 2/2: Depositing liquidity...');
            const transaction2 = new Transaction();
            const liquidityDistribution = createUniformDistribution({ shape: LiquidityShape.Spot, binRange: [lowerBinId, upperBinId] });

            await sdk.addLiquidityIntoPosition({
                positionMint: positionMint.publicKey,
                payer: userPublicKey,
                pair: pairPubKey,
                transaction: transaction2,
                liquidityDistribution,
                amountX: Number(toLamports(amountA, baseTokenInfo.decimals)),
                amountY: Number(toLamports(amountB, quoteTokenInfo.decimals)),
                binArrayLower: await sdk.getBinArray({ binArrayIndex: lowerBinArrayIndex, pair: pairPubKey }),
                binArrayUpper: await sdk.getBinArray({ binArrayIndex: upperBinArrayIndex, pair: pairPubKey })
            });

            const { blockhash: blockhash2, lastValidBlockHeight: lvh2 } = await connection.getLatestBlockhash();
            transaction2.recentBlockhash = blockhash2; 
            transaction2.feePayer = userPublicKey;
            
            setStatus("Final approval needed for deposit...");
            const finalSignature = await sendTransaction(transaction2, connection, { skipPreflight: true });
            
            setStatus("Confirming final transaction...");
            await connection.confirmTransaction({ signature: finalSignature, blockhash: blockhash2, lastValidBlockHeight: lvh2 }, 'confirmed');
            
            setStatus(`Success! Liquidity added. Signature: ${finalSignature.slice(0, 20)}...`);
            onLiquidityAdded(); 
            setTimeout(() => setStatus(''), 5000);
            
        } catch (error: any) {
            console.error("Add liquidity failed:", error);
            setStatus(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isButtonDisabled = isSubmitting || isAmountAInvalid || isAmountBInvalid || !amountA || !amountB || !minPrice || !maxPrice;

    return (
        <Card>
            <form onSubmit={handleAddLiquidity}>
                <CardHeader>
                    <CardTitle>Add Liquidity</CardTitle>
                    <CardDescription>Deposit tokens into a new liquidity position.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* --- Amounts --- */}
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
                            </div>
                        </div>
                    </div>
                     {/* --- Price Range --- */}
                    <div className="space-y-2">
                        <h4 className="font-semibold text-sm">2. Set Price Range</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                                <label className="text-xs font-medium">Min Price ({quoteTokenInfo.symbol} per {baseTokenInfo.symbol})</label>
                                <Input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="0.0" />
                            </div>
                             <div>
                                <label className="text-xs font-medium">Max Price ({quoteTokenInfo.symbol} per {baseTokenInfo.symbol})</label>
                                <Input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="0.0" />
                            </div>
                        </div>
                        <div className="pt-4">
                            <label className="text-xs text-muted-foreground">Set range around current price (+/- {rangePercentage}%)</label>
                            <Slider value={[rangePercentage]} onValueChange={(val) => setRangePercentage(val[0])} min={1} max={50} step={1} className="my-2" />
                             <div className="flex justify-center gap-2">
                                {[1, 5, 10, 25].map(p => (
                                     <Button key={p} type="button" variant="outline" size="sm" onClick={() => setRangePercentage(p)}>+/- {p}%</Button>
                                ))}
                            </div>
                        </div>
                    </div>
                     {/* --- Options --- */}
                    <div className="space-y-2">
                         <h4 className="font-semibold text-sm">3. Options</h4>
                        <div className="flex items-center space-x-2 rounded-md border p-3">
                            <Checkbox id="preflight-check" checked={usePreflightCheck} onCheckedChange={(checked) => setUsePreflightCheck(!!checked)} />
                            <label htmlFor="preflight-check" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Enable Pre-flight Check (Recommended)
                            </label>
                        </div>
                        <p className="text-xs text-muted-foreground px-1">Helps prevent on-chain errors for very narrow price ranges.</p>
                    </div>

                    {status && (
                        <Alert variant={status.startsWith("Error:") ? "destructive" : "default"}>
                           {status.startsWith("Error:") ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                            <AlertTitle>{status.startsWith("Error:") ? "Error" : "Status"}</AlertTitle>
                            <AlertDescription className="break-all">{status.replace("Error:", "")}</AlertDescription>
                        </Alert>
                    )}
                </CardContent>
                <CardFooter>
                    <Button type="submit" disabled={isButtonDisabled} className="w-full">
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : 'Add Liquidity'}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
};