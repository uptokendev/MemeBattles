// components/WalletMenu.jsx
import React from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { InjectedConnector } from 'wagmi/connectors/injected';

export default function WalletMenu() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isLoading, pendingConnector } = useConnect({
    connector: new InjectedConnector(),
  });
  const { disconnect } = useDisconnect();

  const displayAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : '';

  // NOT CONNECTED
  if (!isConnected) {
    return (
      <button
        onClick={() => connect({ connector: connectors[0] })}
        disabled={isLoading}
        className="px-4 py-2 text-sm font-medium rounded-full border border-emerald-400 hover:bg-emerald-500 hover:text-black transition"
      >
        {isLoading && pendingConnector
          ? 'Connecting...'
          : 'Connect Wallet'}
      </button>
    );
  }

  // CONNECTED
  return (
    <div className="relative group">
      <button className="px-4 py-2 text-sm font-medium rounded-full border border-emerald-400 bg-neutral-900 hover:bg-neutral-800 transition">
        {displayAddress}
      </button>

      {/* hover dropdown */}
      <div className="absolute right-0 mt-2 hidden group-hover:block">
        <div className="w-40 rounded-lg border border-neutral-700 bg-neutral-900 shadow-lg py-1">
          <button
            onClick={() => disconnect()}
            className="w-full text-left px-4 py-2 text-sm hover:bg-neutral-800"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}