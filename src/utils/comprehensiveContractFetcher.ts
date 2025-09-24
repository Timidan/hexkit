import type { Chain } from "../types";
import type { ContractInfoResult } from "../types/contractInfo";
import {
  ContractLookupService,
  defaultContractLookupService,
  type ContractLookupOptions,
} from "./services/ContractLookupService";

export type { ContractInfoResult } from "../types/contractInfo";
export { ContractLookupService } from "./services/ContractLookupService";

export const fetchContractInfoComprehensive = async (
  address: string,
  chain: Chain,
  progressCallback?: ContractLookupOptions["progressCallback"],
  options: Omit<ContractLookupOptions, "progressCallback"> = {}
): Promise<ContractInfoResult> =>
  defaultContractLookupService.fetchContractInfo(address, chain, {
    ...options,
    progressCallback,
  });
