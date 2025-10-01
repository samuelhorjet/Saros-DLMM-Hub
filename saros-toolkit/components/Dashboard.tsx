// src/components/Dashboard.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { LiquidityBookServices } from '@saros-finance/dlmm-sdk';
import { EnrichedPositionData } from '@/app/positions/page'; // Assuming this is the correct path
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, Layers, CheckCircle, TrendingUp, Plus, LayoutGrid } from "lucide-react";

interface DashboardProps {
    sdk: LiquidityBookServices;
    onNavigate: (section: 'pools' | 'positions') => void;
}

// A simple card component for displaying stats
const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode }> = ({ title, value, icon }) => (
    <Card className="card-fintech">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
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

    useEffect(() => {
        if (!publicKey || !sdk) return;

        const fetchDashboardData = async () => {
            setIsLoading(true);
            try {
                // 1. Fetch SOL Balance
                const lamports = await connection.getBalance(publicKey);
                setSolBalance(lamports / LAMPORTS_PER_SOL);

                // 2. Fetch Position Data from Cache
                // NOTE: This relies on the user having visited the "My Positions" page first
                // to populate the cache. This is a performance optimization to avoid a slow,
                // full-chain scan on the main dashboard.
                const cachedData = sessionStorage.getItem(`cachedEnrichedPositions_${publicKey.toBase58()}`);
                if (cachedData) {
                    const positions: EnrichedPositionData[] = JSON.parse(cachedData);
                    setTotalPositions(positions.length);

                    const active = positions.filter(p => {
                        const totalLiquidity = p.position.liquidityShares.reduce((acc, current) => acc + BigInt(current), BigInt(0));
                        return totalLiquidity > BigInt(0) && p.poolDetails.activeId >= p.position.lowerBinId && p.poolDetails.activeId <= p.position.upperBinId;
                    }).length;
                    setActivePositions(active);

                    // 3. Calculate Total Liquidity Value (Placeholder)
                    // DEV NOTE: A real implementation requires a price oracle to get the USD value
                    // of each token in the positions. For now, we'll use a placeholder.
                    setTotalLiquidityValue(positions.length * 123.45); // Placeholder value
                } else {
                    setTotalPositions(0);
                    setActivePositions(0);
                    setTotalLiquidityValue(0);
                }
            } catch (error) {
                console.error("Failed to fetch dashboard data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, [publicKey, sdk, connection]);

    const loadingOr = (value: number | null, unit: string = '') => {
        return isLoading ? '...' : `${value ?? 0}${unit}`;
    };
    
    return (
        <div className="space-y-6 animate-slide-up">
            <h2 className="text-3xl font-bold font-serif">Portfolio Overview</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="SOL Balance" value={loadingOr(solBalance, ' SOL')} icon={<Wallet className="h-4 w-4 text-primary" />} />
                <StatCard title="Total Positions" value={loadingOr(totalPositions)} icon={<Layers className="h-4 w-4 text-primary" />} />
                <StatCard title="Active Positions" value={loadingOr(activePositions)} icon={<CheckCircle className="h-4 w-4 text-primary" />} />
                <StatCard title="Total Liquidity Value" value={`$${loadingOr(totalLiquidityValue)}`} icon={<TrendingUp className="h-4 w-4 text-primary" />} />
            </div>

            <Card className="card-fintech">
                <CardHeader>
                    <CardTitle className="font-serif">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Button variant="outline" className="justify-start gap-3" onClick={() => onNavigate('pools')}>
                        <LayoutGrid className="h-4 w-4" /> View & Manage Pools
                    </Button>
                     <Button variant="outline" className="justify-start gap-3" onClick={() => {
                        // We can reuse the "Create Pool" modal logic from PoolList if we abstract it
                        // For now, this just navigates to the pool list where the button exists.
                         onNavigate('pools');
                    }}>
                        <Plus className="h-4 w-4" /> Create a New Pool
                    </Button>
                    <Button variant="outline" className="justify-start gap-3" onClick={() => onNavigate('positions')}>
                        <Layers className="h-4 w-4" /> View My Positions
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};