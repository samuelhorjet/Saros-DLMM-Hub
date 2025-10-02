// src/components/PoolList.tsx
"use client";
import React, { useState, useMemo, useEffect } from "react";
import { CreatePool } from "./CreatePool";
import { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import { PublicKey } from "@solana/web3.js";
import { motion, AnimatePresence } from "framer-motion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Search, Copy, RefreshCw } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";

// --- HELPER COMPONENTS ---

const logoStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  backgroundColor: "#333",
  border: "2px solid var(--card)",
};

const FallbackLogo: React.FC<{ symbol?: string }> = ({ symbol }) => (
  <div style={{ ...logoStyle, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "bold", color: "white" }}>
    {symbol ? symbol.charAt(0).toUpperCase() : "?"}
  </div>
);

const PairLogos: React.FC<{ baseLogo?: string; quoteLogo?: string; baseSymbol?: string; quoteSymbol?: string; }> = ({ baseLogo, quoteLogo, baseSymbol, quoteSymbol }) => (
  <div className="flex items-center">
    {baseLogo ? <img src={baseLogo} alt={baseSymbol} style={logoStyle} /> : <FallbackLogo symbol={baseSymbol} />}
    {quoteLogo ? <img src={quoteLogo} alt={quoteSymbol} style={{ ...logoStyle, marginLeft: "-10px" }} /> : <FallbackLogo symbol={quoteSymbol} />}
  </div>
);

const CopyButton: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="icon" onClick={handleCopy} className="h-7 w-7">
      <Copy className="h-4 w-4" />
      <span className="sr-only">{copied ? "Copied!" : "Copy"}</span>
    </Button>
  );
};

interface PoolListProps {
  pools: any[];
  onPoolSelect: (address: string) => void;
  sdk: LiquidityBookServices;
  onRefresh: () => Promise<void>;
  loading: boolean;
  loadingText: string;
}

export const PoolList: React.FC<PoolListProps> = ({ pools, onPoolSelect, sdk, onRefresh, loading, loadingText }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [filterOption, setFilterOption] = useState<"all" | "with-liquidity" | "zero-liquidity">("with-liquidity");
  const [sortOption, setSortOption] = useState<"desc" | "asc">("desc");

  useEffect(() => {
    const isPotentialAddress = searchValue.length >= 32 && searchValue.length <= 44 && !searchValue.includes("/");
    if (!isPotentialAddress) {
      setSearchError(null);
      setIsValidating(false);
      return;
    }

    setIsValidating(true);
    setSearchError(null);
    const handler = setTimeout(async () => {
      try {
        const pubkey = new PublicKey(searchValue);
        await sdk.getPairAccount(pubkey);
        onPoolSelect(searchValue);
      } catch (error) {
        setSearchError("Not a valid pool address.");
      } finally {
        setIsValidating(false);
      }
    }, 800);
    return () => clearTimeout(handler);
  }, [searchValue, sdk, onPoolSelect]);

  const handlePoolCreated = async () => {
    setIsModalOpen(false);
    await onRefresh();
  };

  const processedPools = useMemo(() => {
    let filteredPools = pools;
    if (filterOption === "with-liquidity") {
      filteredPools = pools.filter((pool) => pool.liquidity > 1); // filter dust
    } else if (filterOption === "zero-liquidity") {
      filteredPools = pools.filter((pool) => pool.liquidity <= 1);
    }
    if (searchValue) {
      const lowerSearch = searchValue.toLowerCase();
      filteredPools = filteredPools.filter(
        (pool) => `${pool.baseSymbol}/${pool.quoteSymbol}`.toLowerCase().includes(lowerSearch) || pool.address.toLowerCase().includes(lowerSearch)
      );
    }
    return [...filteredPools].sort((a, b) => {
      return sortOption === "desc" ? b.liquidity - a.liquidity : a.liquidity - b.liquidity;
    });
  }, [pools, filterOption, sortOption, searchValue]);

  const formatNumber = (num: number | undefined) => {
    if (num === undefined) return "N/A";
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
  const formatPrice = (price: number) => {
    if (price < 0.000001 && price > 0) return `< $0.000001`;
    return `$${price.toFixed(6)}`;
  }

  const renderLoadingState = () => (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center space-x-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="animate-slide-up space-y-4">
      {/* --- Controls --- */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search by symbol (e.g. SOL/USDC) or paste address"
            className="pl-10"
          />
           {(isValidating || searchError) && (
             <div className="absolute text-xs text-muted-foreground mt-1 ml-1">{isValidating ? "Validating address..." : searchError}</div>
           )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterOption} onValueChange={(value) => setFilterOption(value as any)}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Filter pools" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="with-liquidity">With Liquidity</SelectItem>
              <SelectItem value="all">All Pools</SelectItem>
              <SelectItem value="zero-liquidity">Zero Liquidity</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortOption} onValueChange={(value) => setSortOption(value as any)}>
             <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="desc">TVL: High to Low</SelectItem>
                <SelectItem value="asc">TVL: Low to High</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setIsModalOpen(true)} disabled={loading} className="w-full md:w-auto">
            <PlusCircle className="h-5 w-5 mr-2" /> Create Pool
          </Button>
        </div>
      </div>
      
      {isModalOpen && (
           <CreatePool sdk={sdk} onPoolCreated={handlePoolCreated} onClose={() => setIsModalOpen(false)} />
      )}

      {/* --- Pool List --- */}
      {loading && pools.length === 0 ? renderLoadingState() : (
        <>
            <div className="text-sm text-muted-foreground">
                Showing {processedPools.length} of {pools.length} pools.
            </div>
            <Card className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pair</TableHead>
                    <TableHead className="text-right">Total Value Locked</TableHead>
                    <TableHead className="text-right">Current Price</TableHead>
                    <TableHead>Pool Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedPools.length > 0 ? processedPools.map((pool) => (
                    <TableRow key={pool.address} onClick={() => onPoolSelect(pool.address)} className="cursor-pointer">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <PairLogos {...pool} />
                          <span className="font-medium">{pool.baseSymbol}/{pool.quoteSymbol}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatNumber(pool.liquidity)}</TableCell>
                      <TableCell className="text-right font-mono">{formatPrice(pool.price)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{`${pool.address.slice(0, 6)}...${pool.address.slice(-6)}`}</span>
                          <CopyButton textToCopy={pool.address} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center">No pools match your criteria.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>

            <div className="grid gap-4 md:hidden">
                {processedPools.length > 0 ? processedPools.map((pool) => (
                     <Card key={pool.address} onClick={() => onPoolSelect(pool.address)} className="cursor-pointer">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <PairLogos {...pool} />
                                    <span className="font-medium">{pool.baseSymbol}/{pool.quoteSymbol}</span>
                                </div>
                                 <div className="flex items-center gap-2">
                                     <span className="font-mono text-xs text-muted-foreground">{`${pool.address.slice(0, 4)}...${pool.address.slice(-4)}`}</span>
                                     <CopyButton textToCopy={pool.address} />
                                </div>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <div className="text-muted-foreground">TVL</div>
                                    <div className="font-mono">{formatNumber(pool.liquidity)}</div>
                                </div>
                                 <div>
                                    <div className="text-muted-foreground">Price</div>
                                    <div className="font-mono">{formatPrice(pool.price)}</div>
                                </div>
                            </div>
                        </CardContent>
                     </Card>
                )) : (
                    <Card className="h-24 flex items-center justify-center">
                        <p>No pools match your criteria.</p>
                    </Card>
                )}
            </div>
        </>
      )}
    </div>
  );
};