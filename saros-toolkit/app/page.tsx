// src/page.tsx
"use client";
import React, { useState, useMemo, useEffect } from "react";
import { LiquidityBookServices, MODE } from "@saros-finance/dlmm-sdk";
import { PoolList } from "@/components/PoolList";
import { PoolDetails } from "@/components/PoolDetails";
import { Connection, PublicKey } from "@solana/web3.js";
import { getPriceFromId } from "@saros-finance/dlmm-sdk/utils/price";
import dynamic from "next/dynamic";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { getTokenInfo } from "@/utils/token";
import { AnchorProvider, setProvider } from "@coral-xyz/anchor";
import { Dashboard } from "@/components/Dashboard";
// --- 1. IMPORT ROUTER HOOKS ---
import { useRouter, useSearchParams } from "next/navigation";

const WalletProvider = dynamic(
  () => import("@/components/walletContextProvider").then((mod) => mod.WalletContextProvider),
  { ssr: false }
);

// --- AppContent Component ---
const AppContent = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  // --- 2. INITIALIZE ROUTER AND SEARCH PARAMS ---
  const router = useRouter();
  const searchParams = useSearchParams();

  // Determine active view and selected pool from URL
  const selectedPool = searchParams.get('pool');
  const activeView = selectedPool ? 'pool-details' : (searchParams.get('view') || 'dashboard');

  const [pools, setPools] = useState<any[]>([]);
  const [loadingText, setLoadingText] = useState("Please connect your wallet...");

  const sdk = useMemo(() => {
    if (!connected || !wallet || !wallet.publicKey) return null;
    const provider = new AnchorProvider(connection, wallet as any, AnchorProvider.defaultOptions());
    setProvider(provider);
    const sdkInstance = new LiquidityBookServices({ mode: MODE.DEVNET });
    sdkInstance.connection = connection;
    return sdkInstance;
  }, [connected, connection, wallet]);

  const fetchAndFilterPools = async (forceRefresh: boolean = false) => {
    // ... (fetchAndFilterPools function remains unchanged)
    if (!sdk) return;
    try {
      if (!forceRefresh) {
        const cachedPools = sessionStorage.getItem("cachedPools");
        if (cachedPools) {
          setPools(JSON.parse(cachedPools));
          setLoadingText("");
          return;
        }
      }
      setLoadingText("Fetching all pool addresses...");
      const allPoolAddresses = await sdk.fetchPoolAddresses();
      const uniquePoolAddresses = [...new Set(allPoolAddresses)];

      let allFetchedPools: any[] = [];
      const BATCH_SIZE = 8;
      for (let i = 0; i < uniquePoolAddresses.length; i += BATCH_SIZE) {
        const batchAddresses = uniquePoolAddresses.slice(i, i + BATCH_SIZE);
        setLoadingText(`Fetching details for pools (${i + batchAddresses.length}/${uniquePoolAddresses.length})`);

        const batchPromises = batchAddresses.map(async (address) => {
          try {
            const metadata = (await sdk.fetchPoolMetadata(address)) as any;
            const pairAccount = await sdk.getPairAccount(new PublicKey(address));
            
            if (!metadata || !pairAccount) return null;

            const baseReserve = Number(metadata.baseReserve || 0);
            const quoteReserve = Number(metadata.quoteReserve || 0);
            const baseTokenInfo = await getTokenInfo(metadata.baseMint);
            const quoteTokenInfo = await getTokenInfo(metadata.quoteMint);
            
            const { activeId, binStep } = pairAccount;
            const price = getPriceFromId(binStep, activeId, baseTokenInfo.decimals, quoteTokenInfo.decimals);
            const liquidity = baseReserve + quoteReserve;

            return {
              address,
              baseSymbol: baseTokenInfo.symbol,
              quoteSymbol: quoteTokenInfo.symbol,
              baseLogoURI: baseTokenInfo.logoURI,
              quoteLogoURI: quoteTokenInfo.logoURI,
              price: isNaN(price) ? 0 : price,
              liquidity,
            };
          } catch (e) {
            console.error(`Failed to process pool ${address}:`, e);
            return null;
          }
        });
        allFetchedPools.push(
          ...(await Promise.all(batchPromises)).filter((p) => p !== null)
        );
      }
      
      sessionStorage.setItem("cachedPools", JSON.stringify(allFetchedPools));
      setPools(allFetchedPools);
    } catch (err) {
      console.error("Failed to fetch pools:", err);
      setLoadingText("An error occurred. Check console for details.");
    } finally {
      setLoadingText("");
    }
  };

  const handleRefresh = async () => {
    setLoadingText("Refreshing pool list...");
    setPools([]);
    sessionStorage.removeItem("cachedPools");
    await fetchAndFilterPools(true);
  };

  useEffect(() => {
    if (connected && sdk) {
      if (activeView === 'pools') {
        fetchAndFilterPools();
      } else {
        setLoadingText("");
      }
    } else if (!connected) {
      setLoadingText("Please connect your wallet...");
      setPools([]);
      router.push('/'); // Reset to dashboard on disconnect
    }
  }, [connected, sdk, activeView]);

  // --- 3. UPDATE NAVIGATION HANDLERS ---
  const handleNavigation = (section: 'dashboard' | 'pools' | 'positions') => {
    if (section === 'positions') {
      router.push('/positions');
    } else {
      router.push(`/?view=${section}`);
    }
  };
  
  const handlePoolSelect = (address: string) => {
      router.push(`/?pool=${address}`);
  };

  const handleBackToPools = () => {
      router.push('/?view=pools');
  };

  const renderMainContent = () => {
    if (!connected) return <p>Please connect your wallet to continue.</p>;
    if (!sdk) return <p>Initializing SDK...</p>;

    if (selectedPool) {
        return (
            <PoolDetails
                sdk={sdk}
                poolAddress={selectedPool}
                userPublicKey={publicKey!}
                onBack={handleBackToPools}
            />
        );
    }
    
    switch (activeView) {
      case 'pools':
        if (loadingText) return <p>{loadingText}</p>;
        return (
            <PoolList
                pools={pools}
                onPoolSelect={handlePoolSelect}
                sdk={sdk}
                onRefresh={handleRefresh}
                loading={!!loadingText}
            />
        );
      case 'dashboard':
      default:
        return <Dashboard sdk={sdk} onNavigate={handleNavigation} />;
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>DLMM Liquidity DApp (Devnet)</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={() => handleNavigation('dashboard')} style={{ all: 'unset', cursor: 'pointer', padding: '8px 12px' }}>Dashboard</button>
          <button onClick={() => handleNavigation('pools')} style={{ all: 'unset', cursor: 'pointer', padding: '8px 12px' }}>Pools</button>
          <a href="/positions" style={{ padding: '8px 12px', border: '1px solid #444', borderRadius: '4px', textDecoration: 'none', color: 'white' }}>My Positions</a>
          <WalletMultiButton />
        </div>
      </header>
      <hr style={{ margin: "20px 0" }} />
      <main>
        {renderMainContent()}
      </main>
    </div>
  );
};

function App() {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
}

export default App;