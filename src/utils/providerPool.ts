import { ethers } from 'ethers';
import type { Chain } from '../types';
import { networkAccess } from '../config/networkAccess';

export const getSharedProvider = (chain: Chain): ethers.providers.JsonRpcProvider => {
  return networkAccess.access(chain).provider;
};

export const clearProviderCache = () => {
  networkAccess.clear();
};
