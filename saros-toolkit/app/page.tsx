// src/app/page.tsx
"use client";
import React, { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { motion } from "framer-motion";
import { BarChart, Layers, Zap } from "lucide-react";

const HomeContent = () => {
  const { connected } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (connected) {
      router.push("/dashboard");
    }
  }, [connected, router]);

  const featureVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-secondary/50">
      <header className="container mx-auto flex h-20 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {/* You can place your logo here */}
          <Layers className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">Saros DLMM</span>
        </div>
        <WalletMultiButton className="rounded-lg px-4 py-2 font-semibold transition-transform duration-200 hover:scale-105" />
      </header>

      <main className="flex-1">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
          className="container mx-auto flex flex-col items-center justify-center px-4 py-16 text-center md:py-24"
        >
          <h1 className="text-4xl font-extrabold tracking-tight md:text-6xl lg:text-7xl">
            Concentrated Liquidity,
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Maximized Returns.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Experience unparalleled capital efficiency. Create and manage
            liquidity positions on Solana with the power of the Saros DLMM SDK.
          </p>
          <motion.div
            className="mt-8"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <WalletMultiButton className="rounded-lg px-6 py-3 text-lg font-bold shadow-lg transition-transform duration-200 hover:scale-105" />
          </motion.div>
        </motion.div>

        <motion.section
          variants={featureVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
          className="container mx-auto max-w-5xl px-4 py-16"
        >
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <motion.div
              variants={itemVariants}
              className="flex flex-col items-center text-center"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <BarChart className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">High Capital Efficiency</h3>
              <p className="mt-2 text-muted-foreground">
                Concentrate your liquidity in active price ranges to maximize
                your fee earnings from every trade.
              </p>
            </motion.div>
            <motion.div
              variants={itemVariants}
              className="flex flex-col items-center text-center"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Layers className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">
                Flexible Position Management
              </h3>
              <p className="mt-2 text-muted-foreground">
                Easily create, adjust, and rebalance your liquidity positions to
                adapt to changing market conditions.
              </p>
            </motion.div>
            <motion.div
              variants={itemVariants}
              className="flex flex-col items-center text-center"
            >
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Zap className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">
                Lightning-Fast Transactions
              </h3>
              <p className="mt-2 text-muted-foreground">
                Built on Solana for near-instant transaction speeds and
                incredibly low fees.
              </p>
            </motion.div>
            <motion.div
              id="video-tutorial"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="max-w-4xl mx-auto"
            >
              <h2 className="text-3xl font-bold font-serif mb-6">
                How It Works
              </h2>
              <div className="aspect-w-16 aspect-h-9 bg-gray-900 rounded-lg shadow-xl overflow-hidden">
                {/* Replace with your actual video embed code */}
                <iframe
                  className="w-full h-full"
                  src="https://www.youtube.com/embed/dQw4w9WgXcQ" // Placeholder video
                  title="DApp Tutorial"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            </motion.div>
          </div>
        </motion.section>
      </main>
    </div>
  );
};

function HomePage() {
  return <HomeContent />;
}

export default HomePage;
