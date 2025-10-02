"use client";

import React from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { motion } from "framer-motion";

export const LandingPage = () => {
  return (
    <div className="container mx-auto px-4 text-center">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="py-16 md:py-24"
      >
        <h1 className="text-4xl md:text-6xl font-bold font-serif mb-4">
          Provide Liquidity, Maximize Earnings
        </h1>
        <p className="text-lg md:text-xl text-gray-400 max-w-3xl mx-auto mb-8">
          Leverage the Saros DLMM SDK to create and manage concentrated liquidity positions on Solana. Start earning fees with unparalleled capital efficiency.
        </p>
        <div className="flex justify-center items-center gap-4 mb-12">
          <WalletMultiButton style={{ backgroundColor: '#6366F1', borderRadius: '8px' }} />
          <a
            href="#video-tutorial"
            className="px-6 py-3 border border-gray-600 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Learn How
          </a>
        </div>
      </motion.div>

      <motion.div
        id="video-tutorial"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="max-w-4xl mx-auto"
      >
        <h2 className="text-3xl font-bold font-serif mb-6">How It Works</h2>
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
  );
};