// src/app/page.tsx
"use client";
import React, { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { Tweet } from "react-tweet";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { motion } from "framer-motion";
import {
  BarChart,
  Layers,
  Zap,
  DollarSign,
  TrendingUp,
  Users,
  Check,
  ArrowRight,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";

const StatCard: React.FC<{
  icon: React.ReactNode;
  value: string;
  label: string;
}> = ({ icon, value, label }) => (
  <motion.div
    variants={{
      hidden: { opacity: 0, y: 20 },
      visible: { opacity: 1, y: 0 },
    }}
    className="rounded-xl border bg-card/50 p-6 text-center shadow-lg"
  >
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
      {icon}
    </div>
    <p className="mt-4 text-3xl font-bold">{value}</p>
    <p className="text-sm text-muted-foreground">{label}</p>
  </motion.div>
);

const FeatureCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
}> = ({ icon, title, description }) => (
  <motion.div
    variants={{
      hidden: { opacity: 0, y: 20 },
      visible: { opacity: 1, y: 0 },
    }}
    className="flex flex-col items-center text-center"
  >
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
      {icon}
    </div>
    <h3 className="text-xl font-semibold">{title}</h3>
    <p className="mt-2 text-muted-foreground">{description}</p>
  </motion.div>
);

const Step: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
}> = ({ icon, title, description }) => (
  <div className="flex flex-col items-center text-center md:items-start md:text-left">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary text-primary">
      {icon}
    </div>
    <h3 className="text-lg font-semibold">{title}</h3>
    <p className="mt-1 text-muted-foreground">{description}</p>
  </div>
);

const HomeContent = () => {
  const { connected } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (connected) {
      router.push("/dashboard");
    }
  }, [connected, router]);

  const sectionVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1,
      },
    },
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-secondary/50">
      {/* Header */}
      <header className="container sticky top-0 z-50 mx-auto flex h-20 items-center justify-between bg-background/80 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Layers className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">Saros DLMM</span>
        </div>
        <WalletMultiButton className="rounded-lg px-4 py-2 font-semibold transition-transform duration-200 hover:scale-105" />
      </header>

      <main className="flex-1">
        {/* Hero Section */}
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
            <Button
              size="lg"
              className="rounded-lg px-6 py-3 text-lg font-bold shadow-lg transition-transform duration-200 hover:scale-105"
              onClick={() =>
                (
                  document.querySelector(".wallet-adapter-button") as
                    | HTMLButtonElement
                    | undefined
                )?.click()
              }
            >
              Connect Wallet <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </motion.div>
        </motion.div>

        {/* Stats Section */}
        <motion.section
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="container mx-auto max-w-5xl px-4 py-16"
        >
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <StatCard
              icon={<DollarSign />}
              value="$1.2B+"
              label="Total Value Locked"
            />
            <StatCard
              icon={<TrendingUp />}
              value="$500M+"
              label="24h Trading Volume"
            />
            <StatCard icon={<Users />} value="15,000+" label="Active LPs" />
          </div>
        </motion.section>

        {/* Features Section */}
        <motion.section
          id="features"
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="container mx-auto max-w-5xl px-4 py-16"
        >
          <h2 className="mb-12 text-center text-3xl font-bold tracking-tight">
            Why Saros DLMM?
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <FeatureCard
              icon={<BarChart className="h-7 w-7 text-primary" />}
              title="High Capital Efficiency"
              description="Concentrate your liquidity in active price ranges to maximize your fee earnings from every trade."
            />
            <FeatureCard
              icon={<Layers className="h-7 w-7 text-primary" />}
              title="Flexible Position Management"
              description="Easily create, adjust, and rebalance your liquidity positions to adapt to changing market conditions."
            />
            <FeatureCard
              icon={<Zap className="h-7 w-7 text-primary" />}
              title="Lightning-Fast Transactions"
              description="Built on Solana for near-instant transaction speeds and incredibly low fees."
            />
          </div>
        </motion.section>

        {/* Live Demo Section */}
        <motion.section
        id="video-tutorial"
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="container mx-auto max-w-4xl px-4 py-16"
      >
        <h2 className="mb-6 text-center text-3xl font-bold">Live Demo</h2>
        <a
          href="https://x.com/SamuelHorjet/status/1975199975924781390"
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block cursor-pointer overflow-hidden rounded-lg shadow-xl"
        >
          {/* The Screenshot */}
          <Image
            src="/livevideo.jpg" // Assumes the image is in /public/live-demo.png
            alt="Live demo of the Saros DLMM application"
            width={1280}
            height={720}
            className="w-full transition-transform duration-300 group-hover:scale-105"
          />

          {/* The Play Button Overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity duration-300 group-hover:bg-black/50">
            <PlayCircle className="h-20 w-20 text-white/80 transition-transform duration-300 group-hover:scale-110" />
          </div>
        </a>
      </motion.section>

        {/* How to Get Started Section */}
        <motion.section
          id="get-started"
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="container mx-auto max-w-5xl px-4 py-16"
        >
          <h2 className="mb-12 text-center text-3xl font-bold tracking-tight">
            Get Started in 3 Easy Steps
          </h2>
          <div className="relative grid grid-cols-1 gap-12 md:grid-cols-3">
            <div className="absolute left-1/2 top-6 hidden h-0.5 w-2/3 -translate-x-1/2 bg-border md:block"></div>
            <Step
              icon={<span className="font-bold">1</span>}
              title="Connect Your Wallet"
              description="Securely connect your Solana wallet to get started in seconds."
            />
            <Step
              icon={<span className="font-bold">2</span>}
              title="Explore Liquidity Pools"
              description="Browse existing pools or create your own with any token pair."
            />
            <Step
              icon={<span className="font-bold">3</span>}
              title="Add Liquidity & Earn"
              description="Deposit your assets into a pool and start earning fees immediately."
            />
          </div>
        </motion.section>

        {/* Final CTA */}
        <motion.section
          variants={sectionVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
          className="py-24"
        >
          <div className="container mx-auto max-w-3xl rounded-lg bg-gradient-to-r from-primary/80 to-primary p-12 text-center">
            <h2 className="text-3xl font-bold text-primary-foreground">
              Ready to Maximize Your Yield?
            </h2>
            <p className="mt-4 text-lg text-primary-foreground/90">
              Connect your wallet and explore the future of decentralized
              liquidity on Solana.
            </p>
            <div className="mt-8">
              <WalletMultiButton className="rounded-lg bg-background px-6 py-3 text-lg font-bold text-foreground shadow-lg transition-transform duration-200 hover:scale-105" />
            </div>
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-background">
        <div className="container mx-auto flex h-20 items-center justify-between px-4 text-sm text-muted-foreground">
          <p>&copy; 2025 Saros DLMM. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-foreground">
              Docs
            </a>
            <a href="#" className="hover:text-foreground">
              Twitter
            </a>
            <a href="#" className="hover:text-foreground">
              Discord
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

function HomePage() {
  return <HomeContent />;
}

export default HomePage;