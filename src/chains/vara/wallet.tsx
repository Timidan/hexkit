import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Wallet } from "@phosphor-icons/react";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

type Account = { address: string; name?: string; source: string };
const WalletContext = createContext<{
  accounts: Account[]; account: Account | null; connecting: boolean;
  connect: () => Promise<void>; select: (value: string) => void; disconnect: () => void;
} | null>(null);

export function VaraWalletProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [connecting, setConnecting] = useState(false);

  async function connect() {
    setConnecting(true);
    try {
      const { web3Enable, web3Accounts } = await import("@polkadot/extension-dapp");
      const exts = await web3Enable("HexKit");
      if (exts.length === 0) {
        toast.error("No Polkadot wallet extension found or access was denied. Install SubWallet, Talisman or polkadot{.js}.");
        return;
      }
      const accs = await web3Accounts({ ss58Format: 137 });
      if (accs.length === 0) {
        toast.error("The wallet shared no accounts with HexKit.");
        return;
      }
      const mapped = accs.map(({ address, meta }) => ({ address, name: meta.name, source: meta.source }));
      setAccounts(mapped);
      setAccount(mapped[0]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  return <WalletContext.Provider value={{
    accounts, account, connecting, connect,
    select: (value) => setAccount(accounts.find((a) => `${a.source}:${a.address}` === value) ?? null),
    disconnect: () => { setAccount(null); setAccounts([]); },
  }}>{children}</WalletContext.Provider>;
}

export function useVaraWallet() {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error("useVaraWallet must be used inside VaraWalletProvider");
  return wallet;
}

export function VaraWalletButton() {
  const { accounts, account, connecting, connect, select, disconnect } = useVaraWallet();
  if (!account) return <Button variant="ghost" size="icon-inline" aria-label="Connect Vara wallet" loading={connecting} onClick={connect}><Wallet size={16} /></Button>;
  return (
    <Select value={`${account.source}:${account.address}`} onValueChange={(v) => v === "disconnect" ? disconnect() : select(v)}>
      <SelectTrigger size="sm" aria-label="Vara account"><SelectValue>{account.name ?? `${account.address.slice(0, 6)}…${account.address.slice(-4)}`}</SelectValue></SelectTrigger>
      <SelectContent>
        {accounts.map((a) => <SelectItem key={`${a.source}:${a.address}`} value={`${a.source}:${a.address}`}>{a.name ?? `${a.address.slice(0, 6)}…${a.address.slice(-4)}`}</SelectItem>)}
        <SelectItem value="disconnect">Disconnect</SelectItem>
      </SelectContent>
    </Select>
  );
}
