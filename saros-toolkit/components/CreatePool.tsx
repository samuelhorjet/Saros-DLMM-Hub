// src/components/CreatePool.tsx
"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getTokenInfo, TokenInfo } from "@/utils/token";
import { knownTokens } from "@/utils/knownTokens";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ChevronDown, Copy, Search, AlertTriangle, X, Loader2 } from "lucide-react";

// --- CONSTANTS ---
const SUPPORTED_BIN_STEPS = [1, 2, 4, 5, 8, 10, 20, 25, 40, 50, 80, 100, 200];

// --- HELPER UI COMPONENTS ---

const TokenLogo: React.FC<{ token: TokenInfo }> = React.memo(({ token }) => {
  return token.logoURI ? (
    <img src={token.logoURI} alt={token.symbol} width={24} height={24} className="rounded-full" />
  ) : (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">
      {token.symbol.charAt(0)}
    </div>
  );
});

const CopyButton: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="icon" onClick={handleCopy} className="h-6 w-6">
        <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
        <Copy className="h-3 w-3" />
    </Button>
  );
};

const TokenModalRow: React.FC<{ token: TokenInfo; onSelect: (token: TokenInfo) => void; }> = ({ token, onSelect }) => (
    <div
      onClick={() => onSelect(token)}
      className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent"
    >
      <TokenLogo token={token} />
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <strong className="text-sm font-medium">{token.symbol}</strong>
          <span className="text-xs text-muted-foreground">{token.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-muted-foreground">
            {token.mintAddress.slice(0, 6)}...{token.mintAddress.slice(-6)}
          </span>
          <CopyButton textToCopy={token.mintAddress} />
        </div>
      </div>
    </div>
);

// --- TOKEN SELECTION MODAL ---
interface TokenSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectToken: (token: TokenInfo) => void;
  disabledMints?: string[];
  walletTokens: TokenInfo[];
  isLoadingWalletTokens: boolean;
}

const TokenSelectionModal: React.FC<TokenSelectionModalProps> = ({ isOpen, onClose, onSelectToken, disabledMints = [], walletTokens, isLoadingWalletTokens }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [validatedToken, setValidatedToken] = useState<TokenInfo | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "myTokens">("all");

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
      setValidatedToken(null);
      setActiveTab("all");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setValidatedToken(null);
    const handler = setTimeout(async () => {
      if (searchTerm.length > 30) {
        try {
          const info = await getTokenInfo(searchTerm.trim());
          if (info && !disabledMints.includes(info.mintAddress)) {
             setValidatedToken(info);
          }
        } catch (e) { /* silent fail */ }
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm, isOpen, disabledMints]);

  const sourceList = activeTab === "all" ? knownTokens : walletTokens;
  const filteredList = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return sourceList.filter(
      (token) =>
        (token.symbol.toLowerCase().includes(lowerSearch) ||
         token.name?.toLowerCase().includes(lowerSearch) ||
         token.mintAddress.toLowerCase().includes(lowerSearch)) &&
        !disabledMints.includes(token.mintAddress)
    );
  }, [searchTerm, disabledMints, sourceList]);
  
  const handleSelect = (token: TokenInfo) => {
      onSelectToken(token);
      onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-lg border bg-card"
        >
            <div className="p-4 border-b">
                <h4 className="font-semibold">Select a Token</h4>
                <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search name or paste mint address"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                        autoFocus
                    />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
                {validatedToken && <TokenModalRow token={validatedToken} onSelect={handleSelect} />}
                {filteredList.map((token) => (
                    <TokenModalRow key={token.mintAddress} token={token} onSelect={handleSelect} />
                ))}
            </div>
            <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
            </button>
        </motion.div>
    </div>
  );
};

// --- MAIN CREATE POOL COMPONENT ---
export const CreatePool: React.FC<{ sdk: LiquidityBookServices; onPoolCreated: () => void; onClose: () => void; }> = ({ sdk, onPoolCreated, onClose }) => {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [newPoolAddress, setNewPoolAddress] = useState<string | null>(null);

  const [baseToken, setBaseToken] = useState<TokenInfo | null>(null);
  const [quoteToken, setQuoteToken] = useState<TokenInfo | null>(null);
  const [binStep, setBinStep] = useState<number>(20);
  const [priceInput, setPriceInput] = useState<string>("1");
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectingFor, setSelectingFor] = useState<"base" | "quote" | null>(null);
  const [walletTokens, setWalletTokens] = useState<TokenInfo[]>([]);
  const [isLoadingWalletTokens, setIsLoadingWalletTokens] = useState(false);

  const mintsToDisableForModal = useMemo(() => {
    const otherToken = selectingFor === "base" ? quoteToken : baseToken;
    return otherToken ? [otherToken.mintAddress] : [];
  }, [selectingFor, baseToken, quoteToken]);

  const openModal = (type: "base" | "quote") => {
    setSelectingFor(type);
    setIsModalOpen(true);
  };
  
  const handleSelectToken = (token: TokenInfo) => {
    if (selectingFor === "base") setBaseToken(token);
    if (selectingFor === "quote") setQuoteToken(token);
    setIsModalOpen(false);
  };

  const handleCreatePool = async () => {
    if (!publicKey || !baseToken || !quoteToken || Number(priceInput) <= 0) {
      setStatusMessage("Error: Please select both tokens and set a valid price.");
      return;
    }

    setIsProcessing(true);
    setStatusMessage("Verifying token pair...");
    let signature: string | null = null;

    try {
      const [actualBase, actualQuote] = [baseToken, quoteToken].sort((a, b) => a.mintAddress.localeCompare(b.mintAddress));

      if (actualQuote.decimals > actualBase.decimals) {
        throw new Error(`Invalid pair. Quote token (${actualQuote.symbol}) decimals (${actualQuote.decimals}) cannot be greater than Base token (${actualBase.symbol}) decimals (${actualBase.decimals}).`);
      }

      const quoteMint = new PublicKey(actualQuote.mintAddress);
      const [quoteAssetBadgeAddress] = PublicKey.findProgramAddressSync([Buffer.from("quote_asset_badge"), sdk.lbConfig.toBuffer(), quoteMint.toBuffer()], sdk.getDexProgramId());

      const quoteAssetBadgeInfo = await connection.getAccountInfo(quoteAssetBadgeAddress);
      if (!quoteAssetBadgeInfo) {
        throw new Error(`The selected quote token (${actualQuote.symbol}) is not whitelisted by the protocol. Its badge is missing.`);
      }

      setStatusMessage("Building transaction...");

      const { pair, tx } = await sdk.createPairWithConfig({
        tokenBase: { mintAddress: actualBase.mintAddress, decimal: actualBase.decimals },
        tokenQuote: { mintAddress: actualQuote.mintAddress, decimal: actualQuote.decimals },
        binStep,
        ratePrice: Number(priceInput),
        payer: publicKey,
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      setStatusMessage("Please approve transaction...");
      signature = await sendTransaction(tx, connection, { skipPreflight: true });

      setStatusMessage("Waiting for transaction confirmation...");
      const result = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

      if (result.value.err) {
        console.error("On-chain transaction error:", result.value.err);
        const txDetails = await connection.getTransaction(signature, { commitment: "confirmed" });
        const logs = txDetails?.meta?.logMessages?.join("\n") || "";
        if (logs.includes("already in use")) {
          throw new Error(`A pool for this pair with bin step ${binStep} already exists.`);
        }
        throw new Error("Transaction failed on-chain. Check console for details.");
      }

      setStatusMessage(`Success! Pool created.`);
      setNewPoolAddress(pair.toString());
      setTxSignature(signature);
    } catch (error: any) {
      console.error("POOL CREATION FAILED", error);
      setStatusMessage(`Error: ${error.message}`);
      setNewPoolAddress(null);
      setTxSignature(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const TokenButton: React.FC<{ token: TokenInfo | null; onClick: () => void }> = ({ token, onClick }) => (
    <Button variant="outline" className="h-14 w-full justify-between" onClick={onClick}>
      {token ? (
        <div className="flex items-center gap-2">
          <TokenLogo token={token} />
          <span className="font-semibold">{token.symbol}</span>
        </div>
      ) : (
        <span className="text-muted-foreground">Select Token</span>
      )}
      <ChevronDown className="h-4 w-4" />
    </Button>
  );

  if (newPoolAddress) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <CardTitle>Pool Created Successfully!</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">Pool Address:</p>
                    <div className="flex items-center gap-2 rounded-md bg-muted p-2 font-mono text-sm">
                       <span className="truncate">{newPoolAddress}</span>
                       <CopyButton textToCopy={newPoolAddress} />
                    </div>
                </CardContent>
                <CardFooter className="flex gap-4">
                    <Button variant="outline" className="w-full" onClick={() => window.open(`https://solscan.io/tx/${txSignature}?cluster=devnet`, "_blank")}>
                        View Transaction
                    </Button>
                    <Button className="w-full" onClick={onPoolCreated}>Finish</Button>
                </CardFooter>
            </Card>
        </motion.div>
      </div>
    );
  }

  const isButtonDisabled = isProcessing || !baseToken || !quoteToken || !priceInput || Number(priceInput) <= 0;

  return (
    <>
      <AnimatePresence>
        <TokenSelectionModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSelectToken={handleSelectToken}
            disabledMints={mintsToDisableForModal}
            walletTokens={walletTokens}
            isLoadingWalletTokens={isLoadingWalletTokens}
        />
      </AnimatePresence>

      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80" onClick={onClose}>
        <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            onClick={(e: { stopPropagation: () => any; }) => e.stopPropagation()}
        >
            <Card className="w-full max-w-lg">
                <CardHeader>
                    <CardTitle>Create a New Liquidity Pool</CardTitle>
                    <CardDescription>Select two tokens and set an initial price to launch a new pool.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label className="text-sm font-medium">Base Token</label>
                            <TokenButton token={baseToken} onClick={() => openModal("base")} />
                        </div>
                         <div>
                            <label className="text-sm font-medium">Quote Token</label>
                            <TokenButton token={quoteToken} onClick={() => openModal("quote")} />
                        </div>
                    </div>
                     <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label className="text-sm font-medium">Bin Step</label>
                            <Select value={String(binStep)} onValueChange={(val) => setBinStep(Number(val))}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    {SUPPORTED_BIN_STEPS.map((step) => (
                                        <SelectItem key={step} value={String(step)}>{step}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium">
                                Initial Price ({quoteToken?.symbol || "Quote"} per {baseToken?.symbol || "Base"})
                            </label>
                            <Input
                                type="number"
                                value={priceInput}
                                onChange={(e) => setPriceInput(e.target.value)}
                                placeholder="e.g., 10.5"
                                disabled={!baseToken || !quoteToken}
                            />
                        </div>
                    </div>
                    {statusMessage && (
                        <Alert variant={statusMessage.startsWith("Error:") ? "destructive" : "default"}>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>{statusMessage.startsWith("Error:") ? "Error" : "Status"}</AlertTitle>
                            <AlertDescription>{statusMessage.replace("Error: ", "")}</AlertDescription>
                        </Alert>
                    )}
                </CardContent>
                <CardFooter>
                    <Button onClick={handleCreatePool} disabled={isButtonDisabled} className="w-full">
                        {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isProcessing ? "Processing..." : `Create ${baseToken?.symbol || "..."} / ${quoteToken?.symbol || "..."} Pool`}
                    </Button>
                </CardFooter>
            </Card>
        </motion.div>
      </div>
    </>
  );
};