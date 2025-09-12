import { ethers } from 'ethers';
import type { Chain } from '../types';

export interface EventLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber?: number;
  transactionHash?: string;
  logIndex?: number;
}

export interface DecodedEventLog {
  address: string;
  eventName: string;
  signature: string;
  args: Array<{
    name: string;
    type: string;
    value: any;
    indexed: boolean;
  }>;
  blockNumber?: number;
  transactionHash?: string;
  logIndex?: number;
  raw: EventLog;
}

export interface EventFilterCriteria {
  contractAddress?: string;
  eventName?: string;
  fromBlock?: number;
  toBlock?: number;
  topics?: (string | string[] | null)[];
}

export interface EventSearchResult {
  logs: DecodedEventLog[];
  totalCount: number;
  hasMore: boolean;
}

/**
 * Enhanced event log decoder with filtering and search capabilities
 */
export class EventLogDecoder {
  private provider: ethers.providers.Provider;
  private chain: Chain;
  private contractABIs: Map<string, any[]> = new Map();
  
  constructor(provider: ethers.providers.Provider, _chain: Chain) {
    this.provider = provider;
    this.chain = _chain;
  }

  /**
   * Add ABI for a contract to enable event decoding
   */
  addContractABI(address: string, abi: any[]): void {
    this.contractABIs.set(address.toLowerCase(), abi);
  }

  /**
   * Search and decode event logs with advanced filtering
   */
  async searchEventLogs(
    criteria: EventFilterCriteria,
    maxResults: number = 100
  ): Promise<EventSearchResult> {
    try {
      const filter = this.buildEventFilter(criteria);
      
      // Fetch logs from provider
      const logs = await this.provider.getLogs({
        ...filter,
        fromBlock: criteria.fromBlock || 'latest',
        toBlock: criteria.toBlock || 'latest',
      });

      // Limit results to prevent overwhelming the UI
      const limitedLogs = logs.slice(0, maxResults);
      
      // Decode each log
      const decodedLogs = await Promise.all(
        limitedLogs.map(log => this.decodeEventLog({
          address: log.address,
          topics: log.topics,
          data: log.data,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
        }))
      );

      // Filter out null results (failed decodes)
      const validLogs = decodedLogs.filter(log => log !== null) as DecodedEventLog[];

      return {
        logs: validLogs,
        totalCount: logs.length,
        hasMore: logs.length >= maxResults
      };
    } catch (error) {
      console.error('Event log search failed:', error);
      return {
        logs: [],
        totalCount: 0,
        hasMore: false
      };
    }
  }

  /**
   * Decode a single event log
   */
  async decodeEventLog(log: EventLog): Promise<DecodedEventLog | null> {
    try {
      const contractAddress = log.address.toLowerCase();
      const abi = this.contractABIs.get(contractAddress);
      
      if (!abi) {
        // Try to decode using heuristics or known event signatures
        return this.decodeEventLogHeuristic(log);
      }

      const contract = new ethers.Contract(log.address, abi, this.provider);
      const iface = contract.interface;

      // Find the event by topic[0] (event signature hash)
      const eventTopic = log.topics[0];
      const eventFragment = iface.getEvent(eventTopic);
      
      if (!eventFragment) {
        return this.decodeEventLogHeuristic(log);
      }

      // Decode the log
      const decodedLog = iface.parseLog({
        topics: log.topics,
        data: log.data,
      });

      // Build the result with indexed information
      const args = eventFragment.inputs.map((input, index) => ({
        name: input.name,
        type: input.type,
        value: decodedLog.args[index],
        indexed: input.indexed
      }));

      return {
        address: log.address,
        eventName: decodedLog.name,
        signature: decodedLog.signature,
        args,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        raw: log
      };
    } catch (error) {
      console.warn('Failed to decode event log:', error);
      return this.decodeEventLogHeuristic(log);
    }
  }

  /**
   * Attempt to decode event log using heuristics for common events
   */
  private async decodeEventLogHeuristic(log: EventLog): Promise<DecodedEventLog | null> {
    const eventTopic = log.topics[0];
    
    // Common event signatures
    const commonEvents = this.getCommonEventSignatures();
    const knownEvent = commonEvents.find(event => event.topic === eventTopic);
    
    if (knownEvent) {
      try {
        const indexed = knownEvent.inputs.filter(input => input.indexed);
        const nonIndexed = knownEvent.inputs.filter(input => !input.indexed);
        
        // Decode topics (indexed parameters)
        const topicValues: any[] = [];
        for (let i = 0; i < indexed.length; i++) {
          const topicData = log.topics[i + 1]; // Skip first topic (event signature)
          if (topicData) {
            try {
              const decoded = ethers.utils.defaultAbiCoder.decode([indexed[i].type], topicData);
              topicValues.push(decoded[0]);
            } catch (error) {
              topicValues.push(topicData); // Raw value if decoding fails
            }
          }
        }
        
        // Decode data (non-indexed parameters)
        let dataValues: any[] = [];
        if (log.data && log.data !== '0x' && nonIndexed.length > 0) {
          try {
            const nonIndexedTypes = nonIndexed.map(input => input.type);
            const decoded = ethers.utils.defaultAbiCoder.decode(nonIndexedTypes, log.data);
            dataValues = Array.from(decoded);
          } catch (error) {
            console.warn('Failed to decode event data:', error);
          }
        }
        
        // Combine indexed and non-indexed values in the correct order
        const args = knownEvent.inputs.map((input) => {
          let value;
          if (input.indexed) {
            const indexedIndex = indexed.findIndex(inp => inp.name === input.name);
            value = topicValues[indexedIndex];
          } else {
            const nonIndexedIndex = nonIndexed.findIndex(inp => inp.name === input.name);
            value = dataValues[nonIndexedIndex];
          }
          
          return {
            name: input.name,
            type: input.type,
            value: value,
            indexed: input.indexed
          };
        });

        return {
          address: log.address,
          eventName: knownEvent.name,
          signature: knownEvent.signature,
          args,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
          raw: log
        };
      } catch (error) {
        console.warn('Heuristic event decoding failed:', error);
      }
    }
    
    return null;
  }

  /**
   * Build event filter from criteria
   */
  private buildEventFilter(criteria: EventFilterCriteria): any {
    const filter: any = {};
    
    if (criteria.contractAddress) {
      filter.address = criteria.contractAddress;
    }
    
    if (criteria.topics) {
      filter.topics = criteria.topics;
    }
    
    return filter;
  }

  /**
   * Get common event signatures for heuristic decoding
   */
  private getCommonEventSignatures() {
    return [
      {
        topic: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        inputs: [
          { name: 'from', type: 'address', indexed: true },
          { name: 'to', type: 'address', indexed: true },
          { name: 'value', type: 'uint256', indexed: false }
        ]
      },
      {
        topic: '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
        name: 'Approval',
        signature: 'Approval(address,address,uint256)',
        inputs: [
          { name: 'owner', type: 'address', indexed: true },
          { name: 'spender', type: 'address', indexed: true },
          { name: 'value', type: 'uint256', indexed: false }
        ]
      },
      {
        topic: '0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0',
        name: 'OwnershipTransferred',
        signature: 'OwnershipTransferred(address,address)',
        inputs: [
          { name: 'previousOwner', type: 'address', indexed: true },
          { name: 'newOwner', type: 'address', indexed: true }
        ]
      },
      {
        topic: '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31',
        name: 'ApprovalForAll',
        signature: 'ApprovalForAll(address,address,bool)',
        inputs: [
          { name: 'owner', type: 'address', indexed: true },
          { name: 'operator', type: 'address', indexed: true },
          { name: 'approved', type: 'bool', indexed: false }
        ]
      },
      {
        topic: '0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258',
        name: 'Paused',
        signature: 'Paused(address)',
        inputs: [
          { name: 'account', type: 'address', indexed: false }
        ]
      },
      {
        topic: '0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa',
        name: 'Unpaused',
        signature: 'Unpaused(address)',
        inputs: [
          { name: 'account', type: 'address', indexed: false }
        ]
      }
    ];
  }

  /**
   * Get event signature from event name and ABI
   */
  static getEventSignature(eventName: string, abi: any[]): string | null {
    const eventFragment = abi.find(item => 
      item.type === 'event' && item.name === eventName
    );
    
    if (!eventFragment) return null;
    
    const inputs = eventFragment.inputs.map((input: any) => input.type).join(',');
    return `${eventName}(${inputs})`;
  }

  /**
   * Get event topic hash from signature
   */
  static getEventTopic(signature: string): string {
    return ethers.utils.id(signature);
  }
}

/**
 * Format event log value for display
 */
export const formatEventLogValue = (value: any, type: string): string => {
  if (value === null || value === undefined) return 'null';
  
  if (type === 'address') {
    return value.toString();
  }
  
  if (type.includes('uint') || type.includes('int')) {
    const bn = ethers.BigNumber.from(value);
    return bn.toString();
  }
  
  if (type === 'bool') {
    return value ? 'true' : 'false';
  }
  
  if (type.includes('bytes')) {
    const str = value.toString();
    if (str.length > 42) {
      return `${str.slice(0, 42)}... (${(str.length - 2) / 2} bytes)`;
    }
    return str;
  }
  
  return value.toString();
};

/**
 * Get human-readable description for common events
 */
export const getEventDescription = (eventName: string, args: any[]): string => {
  switch (eventName) {
    case 'Transfer':
      if (args.length >= 3) {
        const [from, to, value] = args;
        return `Transfer ${value.value} from ${from.value} to ${to.value}`;
      }
      break;
    case 'Approval':
      if (args.length >= 3) {
        const [owner, spender, value] = args;
        return `${owner.value} approved ${spender.value} to spend ${value.value}`;
      }
      break;
    case 'OwnershipTransferred':
      if (args.length >= 2) {
        const [previousOwner, newOwner] = args;
        return `Ownership transferred from ${previousOwner.value} to ${newOwner.value}`;
      }
      break;
  }
  
  return `${eventName} event`;
};