// src/utils/token.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import { knownTokens } from './knownTokens';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL!;
const customConnection = new Connection(RPC_URL, 'confirmed');
const metaplex = new Metaplex(customConnection);

export interface TokenInfo {
  mintAddress: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  name?: string;
}

// Build maps from imported known tokens
const tokenMap = new Map(knownTokens.map(token => [token.mintAddress, token]));
const tokenInfoCache = new Map<string, TokenInfo>();

export const getTokenInfo = async (mint: string): Promise<TokenInfo> => {
  if (!mint) throw new Error("Mint address cannot be empty.");
  if (tokenInfoCache.has(mint)) return tokenInfoCache.get(mint)!;
  if (tokenMap.has(mint)) return tokenMap.get(mint)!;

  try {
    const mintAddress = new PublicKey(mint);
    let metadata;

    try {
      metadata = await metaplex.nfts().findByMint({ mintAddress });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        console.log(`Token ${mint} has no Metaplex metadata. Fetching decimals directly.`);
        const mintInfo = await metaplex.tokens().findMintByAddress({ address: mintAddress });
        const fallbackInfo: TokenInfo = { 
          mintAddress: mint, 
          symbol: `${mint.slice(0, 4)}...`, 
          decimals: mintInfo.decimals,
          logoURI: ""
        };
        tokenInfoCache.set(mint, fallbackInfo);
        return fallbackInfo;
      } else {
        throw error;
      }
    }

    const decimals = metadata.mint.decimals;
    let symbol = `${mint.slice(0, 4)}...`;
    let logoURI: string | undefined = undefined;
    let name: string | undefined = undefined;

    try {
      const loadedMetadata = await metaplex.nfts().load({ metadata: metadata as any });
      if (loadedMetadata.json?.symbol || loadedMetadata.json?.name) {
        symbol = loadedMetadata.json.symbol || loadedMetadata.json.name!;
      }
      if (loadedMetadata.json?.name) { name = loadedMetadata.json.name; }
      if (loadedMetadata.json?.image) {
        logoURI = loadedMetadata.json.image;
      }
    } catch (loadError) {
      console.warn(`Could not load off-chain JSON for mint ${mint}. Using fallback symbol.`);
    }

    const info: TokenInfo = {
      mintAddress: mint,
      symbol,
      name,
      decimals,
      logoURI: logoURI || "" 
    };

    tokenInfoCache.set(mint, info);
    return info;

  } catch (error) {
    console.error(`A critical error occurred while fetching info for mint ${mint}:`, error);
    throw error;
  }
};
