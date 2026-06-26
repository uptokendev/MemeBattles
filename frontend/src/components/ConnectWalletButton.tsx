import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { ChevronDown, Loader2 } from "lucide-react";

export const ConnectWalletButton = () => {
  const { connect, disconnect, isConnected, account, connecting } = useWallet();

  const shortAddress =
    account && account.length > 10
      ? `${account.slice(0, 6)}...${account.slice(-4)}`
      : account;

  const handleConnect = async () => {
    try {
      await connect();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Failed to open wallet modal");
    }
  };

  if (isConnected) {
    return (
      <Button
        variant="outline"
        className="font-mono text-xs md:text-sm rounded-full px-3 md:px-4 py-1 h-auto flex items-center gap-2"
        onClick={() => void disconnect()}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        {shortAddress}
      </Button>
    );
  }

  return (
    <Button
      onClick={() => void handleConnect()}
      disabled={connecting}
      className="font-retro text-xs md:text-sm rounded-full px-3 md:px-4 py-1 h-auto flex items-center gap-1"
    >
      {connecting ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          Connect Wallet
          <ChevronDown className="h-3 w-3" />
        </>
      )}
    </Button>
  );
};
