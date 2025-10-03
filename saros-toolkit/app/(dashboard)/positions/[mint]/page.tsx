// src/app/positions/[mint]/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { EnrichedPositionData } from "../page";
import { LiquidityBookServices, MODE } from "@saros-finance/dlmm-sdk";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider, setProvider } from "@coral-xyz/anchor";
import { RemoveLiquidityModal } from "@/components/modals/RemoveLiquidityModal";
import { RebalanceModal } from "@/components/modals/RebalanceModal";
import { TokenInfo } from "@/utils/token";
import { BurnPositionModal } from "@/components/modals/BurnPositionModal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Copy, MinusCircle, RefreshCw, Trash2 } from "lucide-react";

// --- Helper Components ---
const CopyButton: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className="h-6 w-6 text-muted-foreground"
    >
      <Copy className="h-3 w-3" />
      <span className="sr-only">Copy</span>
    </Button>
  );
};

const InfoRow: React.FC<{
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
  isAddress?: boolean;
}> = ({ label, value, children, isAddress }) => (
  <div className="flex items-center justify-between py-3 border-b">
    <span className="text-sm text-muted-foreground">{label}</span>
    <div
      className={`flex items-center gap-2 text-sm ${
        isAddress ? "font-mono" : "font-medium"
      }`}
    >
      {value}
      {children}
    </div>
  </div>
);

const logoStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "50%",
};
const FallbackLogo: React.FC<{ symbol?: string }> = ({ symbol }) => (
  <div
    style={{
      ...logoStyle,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "18px",
      fontWeight: "bold",
    }}
    className="bg-muted"
  >
    {symbol ? symbol.charAt(0).toUpperCase() : "?"}
  </div>
);
const PairLogos: React.FC<{ baseToken: TokenInfo; quoteToken: TokenInfo }> = ({
  baseToken,
  quoteToken,
}) => (
  <div className="flex items-center">
    {baseToken.logoURI ? (
      <img src={baseToken.logoURI} alt={baseToken.symbol} style={logoStyle} />
    ) : (
      <FallbackLogo symbol={baseToken.symbol} />
    )}
    {quoteToken.logoURI ? (
      <img
        src={quoteToken.logoURI}
        alt={quoteToken.symbol}
        style={{ ...logoStyle, marginLeft: "-12px" }}
        className="border-2 border-background"
      />
    ) : (
      <FallbackLogo symbol={quoteToken.symbol} />
    )}
  </div>
);

const getPriceFromBinId = (
  binId: number,
  binStep: number,
  baseDecimals: number,
  quoteDecimals: number
): number => 1.0001 ** binId * 10 ** (baseDecimals - quoteDecimals);
const formatPrice = (price: number): string => {
  if (price === Infinity || price > 1e12) return "∞";
  if (!isFinite(price)) return "Out of Range";
  if (price < 1e-6 && price > 0) return "< 0.000001";
  return price.toLocaleString(undefined, { maximumFractionDigits: 6 });
};

const PositionDetailsContent = () => {
  const params = useParams();
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [positionData, setPositionData] = useState<EnrichedPositionData | null>(
    null
  );
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [isRebalanceModalOpen, setIsRebalanceModalOpen] = useState(false);
  const [isBurnModalOpen, setIsBurnModalOpen] = useState(false);

  const mintAddress = params.mint as string;

  useEffect(() => {
    if (mintAddress) {
      const cachedData = sessionStorage.getItem(
        `position_details_${mintAddress}`
      );
      if (cachedData) {
        try {
          setPositionData(JSON.parse(cachedData));
        } catch (e) {
          router.replace("/positions");
        }
      } else {
        router.replace("/positions");
      }
    }
  }, [mintAddress, router]);

  const sdk = useMemo(() => {
    if (!connected || !wallet) return null;
    const provider = new AnchorProvider(
      connection,
      wallet as any,
      AnchorProvider.defaultOptions()
    );
    setProvider(provider);
    const sdkInstance = new LiquidityBookServices({ mode: MODE.DEVNET });
    sdkInstance.connection = connection; // ✅ force it to use your RPC
    return sdkInstance;
  }, [connected, connection, wallet]);

  const handleRefreshAndCloseModals = () => {
    setIsRemoveModalOpen(false);
    setIsRebalanceModalOpen(false);
    setIsBurnModalOpen(false);
    router.push("/positions");
  };

  if (!positionData) {
    return (
      <div className="flex min-h-screen w-full flex-col p-4 md:p-8">
        <Skeleton className="h-10 w-32 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Skeleton className="lg:col-span-2 h-96" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const { position, poolDetails, baseToken, quoteToken, poolAddress, key } =
    positionData;
  const totalLiquidity = position.liquidityShares.reduce(
    (acc, current) => acc + BigInt(current),
    BigInt(0)
  );

  let status: "Active" | "Out of Range" | "Empty" = "Out of Range";
  let statusVariant: "default" | "secondary" | "destructive" = "secondary";
  if (totalLiquidity === BigInt(0)) {
    status = "Empty";
    statusVariant = "destructive";
  } else if (
    poolDetails.activeId >= position.lowerBinId &&
    poolDetails.activeId <= position.upperBinId
  ) {
    status = "Active";
    statusVariant = "default";
  }

  const minPrice = getPriceFromBinId(
    position.lowerBinId,
    poolDetails.binStep,
    baseToken.decimals,
    quoteToken.decimals
  );
  const maxPrice = getPriceFromBinId(
    position.upperBinId,
    poolDetails.binStep,
    baseToken.decimals,
    quoteToken.decimals
  );
  const isActionDisabled = status === "Empty";

  return (
    <div className="min-h-screen w-full">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Positions
        </Button>
        <WalletMultiButton />
      </header>

      <main className="p-4 md:p-8 animate-slide-up">
        <div className="flex items-center gap-4 mb-8">
          <PairLogos baseToken={baseToken} quoteToken={quoteToken} />
          <div>
            <h1 className="text-3xl font-bold">
              {baseToken.symbol} / {quoteToken.symbol}
            </h1>
            <p className="text-muted-foreground">Liquidity Position Details</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Position Details</CardTitle>
            </CardHeader>
            <CardContent>
              <InfoRow
                label="Status"
                value={<Badge variant={statusVariant}>{status}</Badge>}
              />
              <InfoRow
                label="Liquidity Shares"
                value={totalLiquidity.toString()}
              />
              <InfoRow
                label="Min Price"
                value={`${formatPrice(minPrice)} ${quoteToken.symbol}`}
              />
              <InfoRow
                label="Max Price"
                value={`${formatPrice(maxPrice)} ${quoteToken.symbol}`}
              />
              <InfoRow
                label="Bin IDs"
                value={`${position.lowerBinId} to ${position.upperBinId}`}
              />
              <InfoRow label="Position NFT Mint" isAddress>
                <span>{`${key.slice(0, 8)}...${key.slice(-8)}`}</span>
                <CopyButton textToCopy={key} />
              </InfoRow>
              <InfoRow label="Pool Address" isAddress>
                <span>{`${poolAddress.slice(0, 8)}...${poolAddress.slice(
                  -8
                )}`}</span>
                <CopyButton textToCopy={poolAddress} />
              </InfoRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
              <CardDescription>Manage your position.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button
                onClick={() => setIsRebalanceModalOpen(true)}
                disabled={isActionDisabled}
                variant="outline"
                size="lg"
              >
                <RefreshCw className="h-4 w-4 mr-2" /> Rebalance
              </Button>
              <Button
                onClick={() => setIsRemoveModalOpen(true)}
                disabled={isActionDisabled}
                variant="destructive"
                size="lg"
              >
                <MinusCircle className="h-4 w-4 mr-2" /> Remove Liquidity
              </Button>
              {status === "Empty" && (
                <Button
                  onClick={() => setIsBurnModalOpen(true)}
                  variant="destructive"
                  size="lg"
                  className="bg-destructive/50 hover:bg-destructive/60"
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Burn Position NFT
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {sdk && publicKey && (
          <>
            <RemoveLiquidityModal
              isOpen={isRemoveModalOpen}
              onClose={() => setIsRemoveModalOpen(false)}
              sdk={sdk}
              positionToRemove={positionData}
              onSuccess={handleRefreshAndCloseModals}
            />
            <RebalanceModal
              isOpen={isRebalanceModalOpen}
              onClose={() => setIsRebalanceModalOpen(false)}
              sdk={sdk}
              positionToRebalance={positionData}
              onSuccess={handleRefreshAndCloseModals}
            />
            <BurnPositionModal
              isOpen={isBurnModalOpen}
              onClose={() => setIsBurnModalOpen(false)}
              sdk={sdk}
              positionToBurn={positionData}
              onSuccess={handleRefreshAndCloseModals}
            />
          </>
        )}
      </main>
    </div>
  );
};

export default function PositionDetailsPage() {
  return <PositionDetailsContent />;
}
