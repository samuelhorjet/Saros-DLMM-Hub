# Saros DLMM UI: Advanced Liquidity Position Manager

![alt text](./public/saros-dlmm-ui.png)

An advanced, feature-rich interface for creating and managing concentrated liquidity positions on the Solana blockchain, built on the powerful **Saros Dynamic Liquidity Market Maker (DLMM) SDK**.  
This Next.js application provides a seamless, high-performance user experience for liquidity providers to maximize their capital efficiency.

🔗 https://saros-toolkit.netlify.app/

---

## ✨ Key Features

This application is more than just a simple UI; it's a complete toolkit for serious liquidity providers.

- 📈 **Portfolio Dashboard**  
  Get an at-a-glance overview of your total positions, active positions, SOL balance, and estimated portfolio value.

- 🌊 **Comprehensive Pool Management**  
  - View a list of all available liquidity pools.  
  - Filter pools with active liquidity or view all pools.  
  - Sort pools by Total Value Locked (TVL).  
  - Search for pools by token pair or by pasting the pool address directly.  
  - Create brand new liquidity pools with a custom bin step and initial price.

- 💼 **Detailed Position Management**  
  - Drill down into individual pool details to view reserves, current price, and your positions within that pool.  
  - Add new liquidity with a sophisticated UI, including price range sliders and balance checks.

- 🔍 **Advanced Position Scanning**  
  - **Fast Scan**: Instantly loads your positions from a local cache.  
  - **Scan Active Pools**: Scans only pools with meaningful liquidity.  
  - **Scan Inactive Pools**: Finds positions in pools with zero liquidity.  
  - **Full Rescan**: Comprehensive, chain-wide scan.

- 🔧 **Granular Position Actions**  
  - Remove Liquidity.  
  - Rebalance price ranges.  
  - Burn empty Position NFTs.

- 🌙 **Modern Tech & UX**  
  - Built with Next.js 14 (App Router).  
  - Responsive UI with Tailwind CSS + shadcn/ui.  
  - Dark & Light Mode.  
  - Smooth wallet connection logic with loading skeletons to prevent UI flashes.

---

## 🛠️ Technology Stack

- **Framework:** Next.js (App Router)  
- **Language:** TypeScript  

**Blockchain Integration:**  
- `@solana/web3.js`  
- `@solana/wallet-adapter-react`  
- `@saros-finance/dlmm-sdk`  

**UI & Styling:**  
- React  
- Tailwind CSS  
- shadcn/ui  
- Lucide React (Icons)  
- Framer Motion (Animations)  

**Deployment:** Netlify  

---

## 🏛️ Architectural Highlights

- **Resilient Authentication Flow**  
  The primary dashboard layout (`src/app/(dashboard)/layout.tsx`) implements a robust, two-factor verification (`isWalletChecked` and `isMinTimePassed`) to handle wallet state.  
  This eliminates the common redirect race condition in dApps and ensures a smooth loading experience.  

- **Performance-First Caching**  
  Uses `sessionStorage` to cache heavy data (pools, positions) for speed and fewer RPC calls.  

- **Modular & Type-Safe Components**  
  TypeScript + reusable components (`PoolList`, `PositionCard`, `AddLiquidity`, etc.) keep the codebase clean and extendable.  

- **Route Groups for Layouts**  
  Uses Next.js App Router’s Route Groups (`dashboard`) for consistent, protected layouts.

---

## 💡 Future Improvements

- Real-time updates with WebSockets.  
- Transaction History page/modal.  
- Performance analytics (fees, IL, APR).  
- UI Notifications (e.g., react-hot-toast).
