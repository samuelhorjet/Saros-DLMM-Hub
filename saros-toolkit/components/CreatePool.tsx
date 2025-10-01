// src/components/CreatePool.tsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getTokenInfo, TokenInfo } from "@/utils/token";
import { knownTokens } from "@/utils/knownTokens";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, unpackAccount } from "@solana/spl-token";

// --- CONSTANTS & STYLES ---
const SUPPORTED_BIN_STEPS = [1, 2, 4, 5, 8, 10, 20, 25, 40, 50, 80, 100, 200];
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px",
  background: "#222",
  border: "1px solid #444",
  borderRadius: "4px",
  color: "white",
};
const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0,0,0,0.7)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1001,
};
const modalContentStyle: React.CSSProperties = {
  background: "#1a1a1a",
  padding: "20px",
  borderRadius: "8px",
  width: "450px",
  maxHeight: "70vh",
  display: "flex",
  flexDirection: "column",
  border: "1px solid #444",
};
const activeTabStyle: React.CSSProperties = {
  padding: "8px 16px",
  cursor: "pointer",
  background: "#3a76f7",
  border: "1px solid #3a76f7",
  color: "white",
  borderRadius: "4px",
};
const inactiveTabStyle: React.CSSProperties = {
  padding: "8px 16px",
  cursor: "pointer",
  background: "transparent",
  border: "1px solid #444",
  color: "#ccc",
  borderRadius: "4px",
};

// =================================================================================
// --- HELPER COMPONENTS FOR UI ---
// =================================================================================

const TokenLogo: React.FC<{ token: TokenInfo }> = ({ token }) => {
  return token.logoURI ? (
    <img
      src={token.logoURI}
      alt={token.symbol}
      width={40}
      height={40}
      style={{ borderRadius: "50%" }}
    />
  ) : (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: "#555",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "18px",
        fontWeight: "bold",
      }}
    >
      {token.symbol.charAt(0)}
    </div>
  );
};

const CopyIcon: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "5px",
        color: "white",
      }}
    >
      {copied ? "✓" : "📋"}
    </button>
  );
};

const TokenModalRow: React.FC<{
  token: TokenInfo;
  onSelect: (token: TokenInfo) => void;
}> = ({ token, onSelect }) => {
  return (
    <div
      onClick={() => onSelect(token)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "8px",
        cursor: "pointer",
        borderRadius: "4px",
      }}
      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#333")}
      onMouseOut={(e) =>
        (e.currentTarget.style.backgroundColor = "transparent")
      }
    >
      <TokenLogo token={token} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <strong style={{ fontSize: "16px" }}>{token.symbol}</strong>
          <span style={{ fontSize: "14px", color: "#aaa" }}>{token.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span
            style={{ fontSize: "12px", color: "#888", fontFamily: "monospace" }}
          >
            {token.mintAddress.slice(0, 6)}...{token.mintAddress.slice(-6)}
          </span>
          <CopyIcon textToCopy={token.mintAddress} />
        </div>
      </div>
    </div>
  );
};

// =================================================================================
// --- TOKEN SELECTION MODAL ---
// =================================================================================
interface TokenSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectToken: (token: TokenInfo) => void;
  disabledMints?: string[];
  walletTokens: TokenInfo[];
  isLoadingWalletTokens: boolean;
}

const TokenSelectionModal: React.FC<TokenSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectToken,
  disabledMints = [],
  walletTokens,
  isLoadingWalletTokens,
}) => {
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
          setValidatedToken(info);
        } catch (e) {
          /* silent fail on invalid paste */
        }
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm, isOpen]);

  const sourceList = activeTab === "all" ? knownTokens : walletTokens;

  const filteredList = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return sourceList.filter(
      (token) =>
        (token.symbol.toLowerCase().includes(lowerSearch) ||
          (token.name && token.name.toLowerCase().includes(lowerSearch)) ||
          token.mintAddress.toLowerCase().includes(lowerSearch)) &&
        !disabledMints.includes(token.mintAddress)
    );
  }, [searchTerm, disabledMints, sourceList]);

  if (!isOpen) return null;

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <h4 style={{ marginTop: 0 }}>Select a Token</h4>
        <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
          <button
            onClick={() => setActiveTab("all")}
            style={activeTab === "all" ? activeTabStyle : inactiveTabStyle}
          >
            All Tokens
          </button>
          <button
            onClick={() => setActiveTab("myTokens")}
            style={activeTab === "myTokens" ? activeTabStyle : inactiveTabStyle}
          >
            My Tokens
          </button>
        </div>
        <input
          type="text"
          placeholder="Search name or paste mint address"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ ...inputStyle, marginBottom: "10px" }}
          autoFocus
        />
        <div style={{ overflowY: "auto", flex: 1, paddingTop: "5px" }}>
          {validatedToken && (
            <TokenModalRow token={validatedToken} onSelect={onSelectToken} />
          )}

          {activeTab === "myTokens" && isLoadingWalletTokens && (
            <p style={{ textAlign: "center", color: "#aaa" }}>
              Loading your tokens...
            </p>
          )}
          {activeTab === "myTokens" &&
            !isLoadingWalletTokens &&
            walletTokens.length === 0 && (
              <p style={{ textAlign: "center", color: "#aaa" }}>
                No tokens found in your wallet.
              </p>
            )}

          {filteredList.map((token) => (
            <TokenModalRow
              key={`${token.mintAddress}-${activeTab}`}
              token={token}
              onSelect={onSelectToken}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// =================================================================================
// --- MAIN CREATE POOL COMPONENT ---
// =================================================================================
export const CreatePool: React.FC<{
  sdk: LiquidityBookServices;
  onPoolCreated: () => void;
}> = ({ sdk, onPoolCreated }) => {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  // --- State ---
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [newPoolAddress, setNewPoolAddress] = useState<string | null>(null);

  const [baseToken, setBaseToken] = useState<TokenInfo | null>(null);
  const [quoteToken, setQuoteToken] = useState<TokenInfo | null>(null);
  const [binStep, setBinStep] = useState<number>(20);
  const [priceInput, setPriceInput] = useState<string>("1");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectingFor, setSelectingFor] = useState<"base" | "quote" | null>(
    null
  );

  const [walletTokens, setWalletTokens] = useState<TokenInfo[]>([]);
  const [isLoadingWalletTokens, setIsLoadingWalletTokens] = useState(false);
  const [hasFetchedWalletTokens, setHasFetchedWalletTokens] = useState(false);

  // --- Logic ---
  const mintsToDisableForModal = useMemo(() => {
    const otherToken = selectingFor === "base" ? quoteToken : baseToken;
    return otherToken ? [otherToken.mintAddress] : [];
  }, [selectingFor, baseToken, quoteToken]);

  const fetchWalletTokens = useCallback(async () => {
    if (!publicKey) return;
    setIsLoadingWalletTokens(true);
    try {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      const tokenPromises = tokenAccounts.value
        .filter((accountInfo) => {
          const parsedInfo = accountInfo.account.data.parsed.info;
          // Filter out NFTs (decimals === 0 and amount is 1) and tokens with zero balance
          return (
            parsedInfo.tokenAmount.uiAmount > 0 &&
            parsedInfo.tokenAmount.decimals > 0
          );
        })
        .map(async (accountInfo) => {
          try {
            return await getTokenInfo(
              accountInfo.account.data.parsed.info.mint
            );
          } catch (e) {
            // If fetching metadata fails for one token, just skip it.
            console.error(
              `Could not get token info for mint ${accountInfo.account.data.parsed.info.mint}`,
              e
            );
            return null;
          }
        });

      const tokens = (await Promise.all(tokenPromises)).filter(
        (t): t is TokenInfo => t !== null
      );
      setWalletTokens(tokens);
    } catch (error) {
      console.error("Failed to fetch wallet tokens:", error);
      setWalletTokens([]);
    } finally {
      setIsLoadingWalletTokens(false);
      setHasFetchedWalletTokens(true);
    }
  }, [publicKey, connection]);

  const openModal = (type: "base" | "quote") => {
    setSelectingFor(type);
    setIsModalOpen(true);
    if (!hasFetchedWalletTokens && !isLoadingWalletTokens) {
      fetchWalletTokens();
    }
  };

  const handleSelectToken = (token: TokenInfo) => {
    if (selectingFor === "base") setBaseToken(token);
    if (selectingFor === "quote") setQuoteToken(token);
    setIsModalOpen(false);
  };

  const handleCreatePool = async () => {
    if (!publicKey || !baseToken || !quoteToken || Number(priceInput) <= 0) {
      setStatusMessage(
        "Error: Please select both tokens and set a valid price."
      );
      return;
    }

    setIsProcessing(true);
    setStatusMessage("Verifying token pair...");
    let signature: string | null = null;

    try {
      const [actualBase, actualQuote] = [baseToken, quoteToken].sort((a, b) =>
        a.mintAddress.localeCompare(b.mintAddress)
      );

      if (actualQuote.decimals > actualBase.decimals) {
        throw new Error(
          `Invalid pair. Quote token (${actualQuote.symbol}) decimals (${actualQuote.decimals}) cannot be greater than Base token (${actualBase.symbol}) decimals (${actualBase.decimals}).`
        );
      }

      const quoteMint = new PublicKey(actualQuote.mintAddress);
      const [quoteAssetBadgeAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("quote_asset_badge"),
          sdk.lbConfig.toBuffer(),
          quoteMint.toBuffer(),
        ],
        sdk.getDexProgramId()
      );

      const quoteAssetBadgeInfo = await connection.getAccountInfo(
        quoteAssetBadgeAddress
      );
      if (!quoteAssetBadgeInfo) {
        throw new Error(
          `The selected quote token (${actualQuote.symbol}) is not whitelisted by the protocol. Its badge is missing.`
        );
      }

      setStatusMessage("Building transaction...");

      const { pair, tx } = await sdk.createPairWithConfig({
        tokenBase: {
          mintAddress: actualBase.mintAddress,
          decimal: actualBase.decimals,
        },
        tokenQuote: {
          mintAddress: actualQuote.mintAddress,
          decimal: actualQuote.decimals,
        },
        binStep,
        ratePrice: Number(priceInput),
        payer: publicKey,
      });

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      setStatusMessage("Please approve transaction...");
      signature = await sendTransaction(tx, connection, {
        skipPreflight: true,
      });

      setStatusMessage("Waiting for transaction confirmation...");
      const result = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      if (result.value.err) {
        console.error("On-chain transaction error:", result.value.err);
        const txDetails = await connection.getTransaction(signature, {
          commitment: "confirmed",
        });
        const logs = txDetails?.meta?.logMessages?.join("\n") || "";
        if (logs.includes("already in use")) {
          throw new Error(
            `A pool for this pair with bin step ${binStep} already exists.`
          );
        }
        throw new Error(
          "Transaction failed on-chain. Check console for details."
        );
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

  const TokenButtonDisplay: React.FC<{ token: TokenInfo | null }> = ({
    token,
  }) => {
    if (!token) return <span style={{ color: "#888" }}>Select Token</span>;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <TokenLogo token={token} />
        <strong>{token.symbol}</strong>
      </div>
    );
  };

  if (newPoolAddress) {
    return (
      <div style={{ textAlign: "center" }}>
        <h4 style={{ marginBottom: "5px" }}>Pool Created Successfully!</h4>
        <p style={{ fontSize: "12px", color: "#aaa", marginTop: 0 }}>
          Pool Address:
        </p>
        <p
          style={{
            fontFamily: "monospace",
            wordBreak: "break-all",
            background: "#222",
            padding: "8px",
            borderRadius: "4px",
          }}
        >
          {newPoolAddress}
        </p>
        <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
          <button
            onClick={() =>
              window.open(
                `https://solscan.io/tx/${txSignature}?cluster=devnet`,
                "_blank"
              )
            }
            style={{ flex: 1, padding: "10px" }}
          >
            View Transaction
          </button>
          <button
            onClick={onPoolCreated}
            style={{
              flex: 1,
              padding: "10px",
              background: "#3a76f7",
              border: "1px solid #3a76f7",
            }}
          >
            Finish
          </button>
        </div>
      </div>
    );
  }

  const isButtonDisabled =
    isProcessing ||
    !baseToken ||
    !quoteToken ||
    !priceInput ||
    Number(priceInput) <= 0;

  return (
    <div>
      <TokenSelectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectToken={handleSelectToken}
        disabledMints={mintsToDisableForModal}
        walletTokens={walletTokens}
        isLoadingWalletTokens={isLoadingWalletTokens}
      />
      <h4>Create a New Pool</h4>

      <div style={{ display: "flex", gap: "15px", marginBottom: "15px" }}>
        <div style={{ flex: 1 }}>
          <label>Base Token</label>
          <div
            onClick={() => openModal("base")}
            style={{
              ...inputStyle,
              cursor: "pointer",
              padding: "5px 10px",
              background: "#333",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              minHeight: "52px",
            }}
          >
            <TokenButtonDisplay token={baseToken} />
            <span>▼</span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label>Quote Token</label>
          <div
            onClick={() => openModal("quote")}
            style={{
              ...inputStyle,
              cursor: "pointer",
              padding: "5px 10px",
              background: "#333",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              minHeight: "52px",
            }}
          >
            <TokenButtonDisplay token={quoteToken} />
            <span>▼</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "15px", marginBottom: "20px" }}>
        <div style={{ flex: 1 }}>
          <label>Bin Step</label>
          <select
            value={binStep}
            onChange={(e) => setBinStep(Number(e.target.value))}
            style={inputStyle}
          >
            {SUPPORTED_BIN_STEPS.map((step) => (
              <option key={step} value={step}>
                {step}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label>
            Initial Price ({quoteToken?.symbol || "Quote"} per{" "}
            {baseToken?.symbol || "Base"})
          </label>
          <input
            type="number"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            placeholder="e.g., 10.5"
            style={inputStyle}
            disabled={!baseToken || !quoteToken}
          />
        </div>
      </div>

      <button
        onClick={handleCreatePool}
        disabled={isButtonDisabled}
        style={{
          padding: "10px",
          width: "100%",
          cursor: isButtonDisabled ? "not-allowed" : "pointer",
          opacity: isButtonDisabled ? 0.6 : 1,
        }}
      >
        {isProcessing
          ? "Processing..."
          : `Create ${baseToken?.symbol || "..."} / ${
              quoteToken?.symbol || "..."
            } Pool`}
      </button>
      {statusMessage && (
        <p style={{ marginTop: "10px", wordBreak: "break-all" }}>
          {statusMessage}
        </p>
      )}
    </div>
  );
};
