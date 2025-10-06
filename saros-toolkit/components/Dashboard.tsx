// src/components/Dashboard.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { LiquidityBookServices } from '@saros-finance/dlmm-sdk';
import { EnrichedPositionData } from '@/app/(dashboard)/positions/page';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, Layers, CheckCircle, Plus, LayoutGrid, AlertCircle, ExternalLink, History, PlusSquare, MoreHorizontal } from "lucide-react";
import { CreatePool } from './CreatePool';
import { Activity, getActivityLog } from '@/utils/activityLog';
import { getUserCreatedPools } from '@/utils/userCreatedPools';
import { Skeleton } from './ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

function formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const seconds = Math.floor((now - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

const logoStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: "50%", backgroundColor: "#333", border: "2px solid var(--card)"
};
const FallbackLogo: React.FC<{ symbol?: string }> = ({ symbol }) => (
  <div style={{...logoStyle, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "bold"}} className="text-foreground bg-muted">
    {symbol ? symbol.charAt(0).toUpperCase() : "?"}
  </div>
);
const PairLogos: React.FC<{ baseLogo?: string; quoteLogo?: string; baseSymbol?: string; quoteSymbol?: string; }> = ({ baseLogo, quoteLogo, baseSymbol, quoteSymbol }) => (
  <div className="flex items-center">
    {baseLogo ? <img src={baseLogo} alt={baseSymbol} style={logoStyle} /> : <FallbackLogo symbol={baseSymbol} />}
    {quoteLogo ? <img src={quoteLogo} alt={quoteSymbol} style={{ ...logoStyle, marginLeft: "-10px" }} /> : <FallbackLogo symbol={quoteSymbol} />}
  </div>
);

interface DashboardProps {
    sdk: LiquidityBookServices;
    onNavigate: (path: string) => void;
}

const StatCardSkeleton: React.FC = () => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="h-4 w-2/3 animate-pulse rounded-md bg-muted" />
        </CardHeader>
        <CardContent>
            <div className="h-7 w-1/2 animate-pulse rounded-md bg-muted" />
        </CardContent>
    </Card>
);

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode }> = ({ title, value, icon }) => (
    <Card className="hover:border-primary/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
            {icon}
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
        </CardContent>
    </Card>
);

export const Dashboard: React.FC<DashboardProps> = ({ sdk, onNavigate }) => {
    const { publicKey } = useWallet();
    const { connection } = useConnection();

    const [isCreatePoolModalOpen, setIsCreatePoolModalOpen] = useState(false);
    const [activities, setActivities] = useState<Activity[]>([]);
    
    const [solBalance, setSolBalance] = useState<number | null>(null);
    const [totalPositions, setTotalPositions] = useState<number | null>(null);
    const [activePositions, setActivePositions] = useState<number | null>(null);
    const [userCreatedPoolsCount, setUserCreatedPoolsCount] = useState<number | null>(null);
    const [userCreatedPoolsDetails, setUserCreatedPoolsDetails] = useState<any[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchDashboardData = async () => {
        if (!publicKey || !sdk) return;
        setIsLoading(true);
        setError(null);
        try {
            const lamports = await connection.getBalance(publicKey);
            setSolBalance(lamports / LAMPORTS_PER_SOL);

            const cachedData = localStorage.getItem(`cachedEnrichedPositions_${publicKey.toBase58()}`);
            if (cachedData) {
                const positions: EnrichedPositionData[] = JSON.parse(cachedData);
                setTotalPositions(positions.length);
                setActivePositions(positions.filter(p => {
                    const totalLiquidity = p.position.liquidityShares.reduce((acc, current) => acc + BigInt(current), BigInt(0));
                    return totalLiquidity > BigInt(0) && p.poolDetails.activeId >= p.position.lowerBinId && p.poolDetails.activeId <= p.position.upperBinId;
                }).length);
            } else {
                setTotalPositions(0);
                setActivePositions(0);
            }

            const createdPoolAddresses = getUserCreatedPools(publicKey.toBase58());
            setUserCreatedPoolsCount(createdPoolAddresses.length);

            if (createdPoolAddresses.length > 0) {
                const allPoolsCache = localStorage.getItem('cachedPools');
                if (allPoolsCache) {
                    const allPools = JSON.parse(allPoolsCache);
                    const details = createdPoolAddresses
                        .map(address => allPools.find((p: any) => p.address === address))
                        .filter(Boolean);
                    setUserCreatedPoolsDetails(details);
                }
            } else {
                setUserCreatedPoolsDetails([]);
            }

            setActivities(getActivityLog());

        } catch (err: any) {
            console.error("Failed to fetch dashboard data:", err);
            setError("Could not load your portfolio data. Please try refreshing.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, [publicKey, sdk, connection]);
    
    const handlePoolCreated = () => {
        setIsCreatePoolModalOpen(false);
        fetchDashboardData();
    };

    const formatStatValue = (value: number | null) => {
        if (value === null) return '-';
        return value;
    };
    
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-destructive/50 bg-destructive/10 p-12 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <h3 className="mt-4 text-xl font-semibold text-destructive">{error}</h3>
                <p className="mt-2 text-sm text-muted-foreground">There was an issue connecting to the network.</p>
            </div>
        )
    }

    return (
        <>
            {isCreatePoolModalOpen && (
                <CreatePool 
                    sdk={sdk} 
                    onPoolCreated={handlePoolCreated} 
                    onClose={() => setIsCreatePoolModalOpen(false)} 
                />
            )}

            <div className="animate-slide-up space-y-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Portfolio Overview</h2>
                    <p className="text-muted-foreground">Here's a snapshot of your liquidity positions and assets.</p>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {isLoading ? (
                                <>
                                    <StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton />
                                </>
                            ) : (
                                <>
                                    <StatCard title="SOL Balance" value={solBalance?.toFixed(4) ?? '-'} icon={<Wallet className="h-4 w-4 text-muted-foreground" />} />
                                    <StatCard title="Total Positions" value={formatStatValue(totalPositions)} icon={<Layers className="h-4 w-4 text-muted-foreground" />} />
                                    <StatCard title="Active Positions" value={formatStatValue(activePositions)} icon={<CheckCircle className="h-4 w-4 text-muted-foreground" />} />
                                    <StatCard title="Pools Created" value={formatStatValue(userCreatedPoolsCount)} icon={<PlusSquare className="h-4 w-4 text-muted-foreground" />} />
                                </>
                            )}
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle>Quick Actions</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                <Button variant="outline" size="lg" onClick={() => onNavigate('/pools')}>
                                    <LayoutGrid className="mr-2 h-4 w-4" /> View & Manage Pools
                                </Button>
                                <Button variant="default" size="lg" onClick={() => setIsCreatePoolModalOpen(true)}>
                                    <Plus className="mr-2 h-4 w-4" /> Create a New Pool
                                </Button>
                                <Button variant="outline" size="lg" onClick={() => onNavigate('/positions')}>
                                    <Layers className="mr-2 h-4 w-4" /> View My Positions
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="lg:col-span-1">
                        <Card className="h-full">
                            <CardHeader>
                                <CardTitle className="flex items-center">
                                    <History className="mr-2 h-5 w-5" /> Recent Activity
                                </CardTitle>
                                <CardDescription>Your latest transactions on the protocol.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isLoading ? (
                                    <div className="space-y-4">
                                        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                                    </div>
                                ) : activities.length > 0 ? (
                                    <div className="space-y-4">
                                        {activities.map((activity) => (
                                            <div key={activity.tx} className="flex items-start justify-between">
                                                <div className="flex-1 pr-2">
                                                    <p className="font-semibold text-sm">{activity.type}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{activity.details}</p>
                                                     <p className="text-xs text-muted-foreground">{formatTimeAgo(activity.timestamp)}</p>
                                                </div>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        {activity.type === 'Create Pool' && activity.poolAddress && (
                                                            <DropdownMenuItem onClick={() => onNavigate(`/pools/${activity.poolAddress}`)}>
                                                                <LayoutGrid className="mr-2 h-4 w-4" />
                                                                View Pool
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuItem onClick={() => window.open(`https://solscan.io/tx/${activity.tx}?cluster=devnet`, "_blank")}>
                                                            <ExternalLink className="mr-2 h-4 w-4" />
                                                            View Transaction
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-sm text-muted-foreground py-8">No recent activity found.</p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </>
    );
};