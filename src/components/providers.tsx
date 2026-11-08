import type { ReactNode } from "react";
import { WalletProvider } from "@/lib/wallet";
import { PlayerProvider } from "@/lib/player";
import { ToastProvider } from "@/components/toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <WalletProvider>
        <PlayerProvider>{children}</PlayerProvider>
      </WalletProvider>
    </ToastProvider>
  );
}
