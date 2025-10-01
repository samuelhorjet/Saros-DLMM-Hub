// src/components/PoolList.tsx
import React, { useState, useMemo, useEffect, useRef } from "react";
import { CreatePool } from "./CreatePool";
import { LiquidityBookServices } from "@saros-finance/dlmm-sdk";
import { PublicKey } from "@solana/web3.js";

// --- Styles ---
const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.75)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};
const modalContentStyle: React.CSSProperties = {
  background: "#1a1a1a",
  padding: "25px",
  borderRadius: "8px",
  width: "90%",
  maxWidth: "600px",
  maxHeight: "90vh",
  overflowY: "auto",
  position: "relative",
  border: "1px solid #444",
};
const closeButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: "10px",
  right: "15px",
  background: "transparent",
  border: "none",
  color: "white",
  fontSize: "24px",
  cursor: "pointer",
};
const activeTabStyle: React.CSSProperties = {
  padding: "8px 16px",
  cursor: "pointer",
  background: "#007bff",
  border: "1px solid #007bff",
  color: "white",
  borderRadius: "4px",
};
const inactiveTabStyle: React.CSSProperties = {
  padding: "8px 16px",
  cursor: "pointer",
  background: "#333",
  border: "1px solid #444",
  color: "#ccc",
  borderRadius: "4px",
};

// --- HELPER COMPONENTS FOR LOGOS ---

const logoStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  backgroundColor: "#333",
  border: "2px solid #1a1a1a",
};

const FallbackLogo: React.FC<{ symbol?: string }> = ({ symbol }) => (
  <div
    style={{
      ...logoStyle,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "14px",
      fontWeight: "bold",
      color: "white",
    }}
  >
    {symbol ? symbol.charAt(0).toUpperCase() : "?"}
  </div>
);

const PairLogos: React.FC<{
  baseLogo?: string;
  quoteLogo?: string;
  baseSymbol?: string;
  quoteSymbol?: string;
}> = ({ baseLogo, quoteLogo, baseSymbol, quoteSymbol }) => {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {baseLogo ? (
        <img src={baseLogo} alt={baseSymbol} style={logoStyle} />
      ) : (
        <FallbackLogo symbol={baseSymbol} />
      )}
      {quoteLogo ? (
        <img
          src={quoteLogo}
          alt={quoteSymbol}
          style={{ ...logoStyle, marginLeft: "-10px" }}
        />
      ) : (
        <FallbackLogo symbol={quoteSymbol} />
      )}
    </div>
  );
};

interface PoolListProps {
  pools: any[];
  onPoolSelect: (address: string) => void;
  sdk: LiquidityBookServices;
  onRefresh: () => Promise<void>;
  loading: boolean;
}

const formatNumber = (num: number | undefined) => {
  if (num === undefined) return "N/A";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: "5px",
        color: "white",
        marginLeft: "8px",
      }}
      title="Copy address"
    >
      {copied ? "✓" : "📋"}
    </button>
  );
};

export const PoolList: React.FC<PoolListProps> = ({
  pools,
  onPoolSelect,
  sdk,
  onRefresh,
  loading,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const [filterOption, setFilterOption] = useState<
    "all" | "with-liquidity" | "zero-liquidity"
  >("with-liquidity");
  const [sortOption, setSortOption] = useState<"desc" | "asc">("desc");

  // --- FIX: This effect now *only* handles direct navigation for valid pasted addresses ---
  useEffect(() => {
    const isPotentialAddress =
      searchValue.length >= 32 &&
      searchValue.length <= 44 &&
      !searchValue.includes("/");

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
    }, 500);

    return () => clearTimeout(handler);
  }, [searchValue, sdk, onPoolSelect]);

  const handlePoolCreated = async () => {
    setIsModalOpen(false);
    await onRefresh();
  };

  // --- FIX: List processing now includes filtering by symbol or address from the search bar ---
  const processedPools = useMemo(() => {
    let filteredPools = pools;

    if (filterOption === "with-liquidity") {
      filteredPools = pools.filter((pool) => pool.liquidity > 0);
    } else if (filterOption === "zero-liquidity") {
      filteredPools = pools.filter((pool) => pool.liquidity === 0);
    }

    if (searchValue) {
      const lowerSearch = searchValue.toLowerCase();
      filteredPools = filteredPools.filter(
        (pool) =>
          `${pool.baseSymbol}/${pool.quoteSymbol}`
            .toLowerCase()
            .includes(lowerSearch) ||
          pool.address.toLowerCase().includes(lowerSearch)
      );
    }

    if (filterOption === "with-liquidity" || filterOption === "all") {
      filteredPools = [...filteredPools].sort((a, b) => {
        return sortOption === "desc"
          ? b.liquidity - a.liquidity
          : a.liquidity - b.liquidity;
      });
    }

    return filteredPools;
  }, [pools, filterOption, sortOption, searchValue]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "5px",
          gap: "15px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            // --- FIX: Placeholder text updated for new functionality ---
            placeholder="Search by symbol (e.g. SOL/USDC) or paste address"
            style={{
              flexGrow: 1,
              padding: "10px",
              background: "#222",
              border: "1px solid #444",
              borderRadius: "4px",
              color: "white",
            }}
          />
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            padding: "10px 20px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          disabled={loading}
        >
          + Create Pool
        </button>
      </div>
      <div
        style={{
          height: "20px",
          marginBottom: "15px",
          fontSize: "12px",
          paddingLeft: "2px",
        }}
      >
        {isValidating && (
          <p style={{ color: "#aaa", margin: 0 }}>Validating address...</p>
        )}
        {searchError && (
          <p style={{ color: "red", margin: 0 }}>{searchError}</p>
        )}
      </div>

      {isModalOpen && (
        <div style={modalOverlayStyle} onClick={() => setIsModalOpen(false)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <button
              style={closeButtonStyle}
              onClick={() => setIsModalOpen(false)}
            >
              &times;
            </button>
            <CreatePool sdk={sdk} onPoolCreated={handlePoolCreated} />
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "15px",
          flexWrap: "wrap",
          gap: "15px",
        }}
      >
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => setFilterOption("all")}
            style={filterOption === "all" ? activeTabStyle : inactiveTabStyle}
          >
            All
          </button>
          <button
            onClick={() => setFilterOption("with-liquidity")}
            style={
              filterOption === "with-liquidity"
                ? activeTabStyle
                : inactiveTabStyle
            }
          >
            With Liquidity
          </button>
          <button
            onClick={() => setFilterOption("zero-liquidity")}
            style={
              filterOption === "zero-liquidity"
                ? activeTabStyle
                : inactiveTabStyle
            }
          >
            Zero Liquidity
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as "desc" | "asc")}
            disabled={filterOption === "zero-liquidity"}
            style={{
              padding: "8px",
              background: "#222",
              border: "1px solid #444",
              borderRadius: "4px",
              color: "white",
              opacity: filterOption === "zero-liquidity" ? 0.5 : 1,
            }}
          >
            <option value="desc">Sort: High to Low</option>
            <option value="asc">Sort: Low to High</option>
          </select>
          <button
            onClick={onRefresh}
            disabled={loading}
            style={{ padding: "8px 12px", cursor: "pointer" }}
          >
            Refresh
          </button>
          <span style={{ marginLeft: "15px", fontSize: "14px", color: "#ccc" }}>
            Total Pools: {processedPools.length}
          </span>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th
              style={{
                border: "1px solid #444",
                padding: "8px",
                textAlign: "left",
              }}
            >
              Pair
            </th>
            <th
              style={{
                border: "1px solid #444",
                padding: "8px",
                textAlign: "left",
              }}
            >
              Total Liquidity
            </th>
            <th
              style={{
                border: "1px solid #444",
                padding: "8px",
                textAlign: "left",
              }}
            >
              Current Price
            </th>
            <th
              style={{
                border: "1px solid #444",
                padding: "8px",
                textAlign: "left",
              }}
            >
              Pool Address
            </th>
          </tr>
        </thead>
        <tbody>
          {processedPools.length > 0 ? (
            processedPools.map((pool) => (
              <tr
                key={pool.address}
                onClick={() => onPoolSelect(pool.address)}
                style={{ cursor: "pointer" }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.backgroundColor = "#333")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <td style={{ border: "1px solid #444", padding: "8px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <PairLogos
                      baseLogo={pool.baseLogoURI}
                      quoteLogo={pool.quoteLogoURI}
                      baseSymbol={pool.baseSymbol}
                      quoteSymbol={pool.quoteSymbol}
                    />
                    <span>
                      {pool.baseSymbol}/{pool.quoteSymbol}
                    </span>
                  </div>
                </td>
                <td
                  style={{
                    border: "1px solid #444",
                    padding: "8px",
                    fontFamily: "monospace",
                  }}
                >
                  {formatNumber(pool.liquidity)}
                </td>
                <td
                  style={{
                    border: "1px solid #444",
                    padding: "8px",
                    fontFamily: "monospace",
                  }}
                >
                  {pool.price.toFixed(6)}
                </td>

                <td style={{ border: "1px solid #444", padding: "8px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontFamily: "monospace", fontSize: "12px" }}>
                      {pool.address}
                    </span>
                    <CopyIcon textToCopy={pool.address} />
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={4}
                style={{
                  border: "1px solid #444",
                  padding: "8px",
                  textAlign: "center",
                }}
              >
                No pools match your criteria.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
