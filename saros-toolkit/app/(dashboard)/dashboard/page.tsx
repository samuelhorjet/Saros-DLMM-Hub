// src/components/Dashboard.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { LiquidityBookServices } from '@saros-finance/dlmm-sdk';
import { EnrichedPositionData } from '@/app/(dashboard)/positions/page';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, Layers, CheckCircle, TrendingUp, Plus, LayoutGrid, AlertCircle } from "lucide-react";

interface DashboardProps {
    sdk: LiquidityBookServices;
    onNavigate: (section: 'pools' | 'positions') => void;
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

    const [solBalance, setSolBalance] = useState<number | null>(null);
    const [totalPositions, setTotalPositions] = useState<number | null>(null);
    const [activePositions, setActivePositions] = useState<number | null>(null);
    const [totalLiquidityValue, setTotalLiquidityValue] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!publicKey || !sdk) return;

        const fetchDashboardData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // Fetch SOL Balance
                const lamports = await connection.getBalance(publicKey);
                setSolBalance(lamports / LAMPORTS_PER_SOL);

                // Fetch Position Data from Cache
                const cachedData = localStorage.getItem(`cachedEnrichedPositions_${publicKey.toBase58()}`);
                if (cachedData) {
                    const positions: EnrichedPositionData[] = JSON.parse(cachedData);
                    setTotalPositions(positions.length);

                    const active = positions.filter(p => {
                        const totalLiquidity = p.position.liquidityShares.reduce((acc, current) => acc + BigInt(current), BigInt(0));
                        return totalLiquidity > BigInt(0) && p.poolDetails.activeId >= p.position.lowerBinId && p.poolDetails.activeId <= p.position.upperBinId;
                    }).length;
                    setActivePositions(active);
                    
                    // DEV NOTE: A real implementation requires a price oracle.
                    // This placeholder remains but is more clearly defined.
                    setTotalLiquidityValue(positions.length * 123.45); // Placeholder value
                } else {
                    // If no cache, we should fetch or show 0. Showing 0 is faster for the dashboard.
                    setTotalPositions(0);
                    setActivePositions(0);
                    setTotalLiquidityValue(0);
                }
            } catch (err: any) {
                console.error("Failed to fetch dashboard data:", err);
                setError("Could not load your portfolio data. Please try refreshing.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, [publicKey, sdk, connection]);

    const formatValue = (value: number | null, decimals: number = 2, unit: string = '') => {
        if (value === null) return '...';
        return `${value.toFixed(decimals)}${unit}`;
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
        <div className="animate-slide-up space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Portfolio Overview</h2>
                <p className="text-muted-foreground">Here's a snapshot of your liquidity positions and assets.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {isLoading ? (
                    <>
                        <StatCardSkeleton />
                        <StatCardSkeleton />
                        <StatCardSkeleton />
                        <StatCardSkeleton />
                    </>
                ) : (
                    <>
                        <StatCard title="SOL Balance" value={formatValue(solBalance, 4, ' SOL')} icon={<Wallet className="h-4 w-4 text-muted-foreground" />} />
                        <StatCard title="Total Positions" value={totalPositions ?? 0} icon={<Layers className="h-4 w-4 text-muted-foreground" />} />
                        <StatCard title="Active Positions" value={activePositions ?? 0} icon={<CheckCircle className="h-4 w-4 text-muted-foreground" />} />
                        <StatCard title="Estimated TVL" value={`$${formatValue(totalLiquidityValue, 2)}`} icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />} />
                    </>
                )}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Button variant="outline" size="lg" onClick={() => onNavigate('pools')}>
                        <LayoutGrid /> View & Manage Pools
                    </Button>
                     <Button variant="outline" size="lg" onClick={() => onNavigate('pools')}>
                        <Plus /> Create a New Pool
                    </Button>
                    <Button variant="outline" size="lg" onClick={() => onNavigate('positions')}>
                        <Layers /> View My Positions
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};