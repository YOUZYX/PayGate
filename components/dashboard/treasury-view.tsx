"use client";

import { useEffect } from "react";
import {
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ExternalLink, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { PAYGATE_ROUTER_ADDRESS, paygateRouterAbi } from "@/lib/contract";
import { monadTestnet } from "@/lib/chain";
import { formatMon, truncateAddress } from "@/components/dashboard/lib";

const EXPLORER = "https://testnet.monadvision.com";

export function TreasuryView({ wallet }: { wallet: string }) {
  const routerDeployed = PAYGATE_ROUTER_ADDRESS.length > 0;
  const address = wallet as `0x${string}`;

  const balanceRead = useReadContract({
    address: PAYGATE_ROUTER_ADDRESS,
    abi: paygateRouterAbi,
    functionName: "balances",
    args: [address],
    chainId: monadTestnet.id,
    query: { enabled: routerDeployed },
  });

  const feeRead = useReadContract({
    address: PAYGATE_ROUTER_ADDRESS,
    abi: paygateRouterAbi,
    functionName: "protocolFeeBps",
    chainId: monadTestnet.id,
    query: { enabled: routerDeployed },
  });

  const {
    writeContract,
    data: txHash,
    isPending: isSigning,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isConfirmed && txHash) {
      toast.success("Earnings withdrawn", {
        description: "View transaction on MonadVision",
        action: {
          label: "Explorer",
          onClick: () => window.open(`${EXPLORER}/tx/${txHash}`, "_blank"),
        },
      });
      balanceRead.refetch();
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash]);

  const claimable = balanceRead.data ?? 0n;
  const busy = isSigning || isConfirming;

  if (!routerDeployed) {
    return (
      <div>
        <Header />
        <div className="flex flex-col items-center border border-border px-8 py-16 text-center">
          <Landmark className="mb-4 size-6 text-muted-foreground" />
          <p className="font-mono text-sm font-bold uppercase tracking-widest">
            Contract not deployed
          </p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            The PayGateRouter address is not configured yet
            (NEXT_PUBLIC_PAYGATE_ROUTER). Treasury reads and withdrawals will
            activate once the contract is live on Monad Testnet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />

      <div className="grid grid-cols-2 gap-3">
        <div className="border border-border bg-card p-6">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Claimable earnings
          </p>
          {balanceRead.isLoading ? (
            <Skeleton className="mt-3 h-12 w-40" />
          ) : (
            <p className="mt-2 font-mono text-5xl font-bold tabular-nums">
              {formatMon(claimable.toString(), 6)}
              <span className="ml-2 text-base text-muted-foreground">MON</span>
            </p>
          )}
          <p className="mt-2 font-mono text-[10px] tracking-widest text-muted-foreground">
            {claimable.toString()} WEI
          </p>

          <button
            type="button"
            disabled={busy || claimable === 0n}
            onClick={() =>
              writeContract(
                {
                  address: PAYGATE_ROUTER_ADDRESS,
                  abi: paygateRouterAbi,
                  functionName: "withdrawEarnings",
                  chainId: monadTestnet.id,
                },
                {
                  onError: (err) =>
                    toast.error(err.message.split("\n")[0] ?? "Withdraw failed"),
                }
              )
            }
            className="mt-6 inline-flex w-full items-center justify-center gap-2 border border-acid bg-acid px-4 py-3 font-mono text-sm font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-transparent hover:text-acid disabled:pointer-events-none disabled:opacity-40"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {isSigning
              ? "Confirm in wallet…"
              : isConfirming
                ? "Confirming…"
                : "Withdraw Earnings"}
          </button>
          {txHash && (
            <a
              href={`${EXPLORER}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-acid"
            >
              TX {truncateAddress(txHash)} <ExternalLink className="size-3" />
            </a>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Protocol fee
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums">
              {feeRead.data !== undefined
                ? `${Number(feeRead.data) / 100}%`
                : "—"}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              {feeRead.data !== undefined
                ? `${feeRead.data.toString()} BPS · Deducted at payment, rest credited to you`
                : "Reading from router…"}
            </p>
          </div>
          <div className="border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Router contract
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className="font-mono text-xs"
                title={PAYGATE_ROUTER_ADDRESS}
              >
                {truncateAddress(PAYGATE_ROUTER_ADDRESS)}
              </span>
              <a
                href={`${EXPLORER}/address/${PAYGATE_ROUTER_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex size-6 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-acid hover:text-acid"
                aria-label="View router on explorer"
              >
                <ExternalLink className="size-3" />
              </a>
            </div>
            <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              Payments settle here · earnings pull-withdrawn
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="mb-6 border-b border-border pb-4">
      <h1 className="font-mono text-xl font-bold uppercase">Treasury</h1>
      <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        Onchain earnings · PayGateRouter
      </p>
    </div>
  );
}
