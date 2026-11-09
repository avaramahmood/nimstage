import { useQuery } from "@tanstack/react-query";
import type { Serialized } from "@shared/types";
import type { listValidators, StakerPosition } from "@srv/staking";
import { api } from "./api";

export type Validator = Serialized<Awaited<ReturnType<typeof listValidators>>>[number];
export type Position = Serialized<StakerPosition>;

/** Nimiq's staking minimum for a new staker. */
export const MIN_STAKE_NIM = 100;
/**
  A rough yearly rate for NIM staking before the pool's fee, estimated from the emission schedule (about 64% of NIM is
  staked). It is only used for the "about how much" line, always labelled an estimate; real rewards vary.
*/
export const ESTIMATE_APY = 0.08;

export const useValidators = () =>
  useQuery({ queryKey: ["earn-validators"], queryFn: () => api<{ validators: Validator[] }>("/api/earn/validators"), staleTime: 10 * 60_000, retry: 1 });

export const usePosition = (address: string | null, refetchMs: number | false = false) =>
  useQuery({
    queryKey: ["earn-position", address],
    queryFn: () => api<{ available: boolean; staker: Position | null }>(`/api/earn/position?address=${encodeURIComponent(address!)}`),
    enabled: !!address,
    refetchInterval: refetchMs,
    staleTime: 5_000,
  });

export const payoutText = (v: Pick<Validator, "payoutType" | "payoutSchedule">) =>
  v.payoutType === "restake" ? `Rewards are added to your stake${v.payoutSchedule ? ` · ${v.payoutSchedule}` : ""}` : v.payoutType === "direct" ? `Rewards are paid to your wallet${v.payoutSchedule ? ` · ${v.payoutSchedule}` : ""}` : "Doesn't pay out rewards";

/** About what a year of staking pays, after the pool's fee. An estimate, never a promise. */
export const yearlyEstimate = (nim: number, fee: number) => nim * ESTIMATE_APY * (1 - fee);
