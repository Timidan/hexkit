import React, { useState } from 'react';
import { ChevronDown, Settings } from 'lucide-react';

const ExactTenderlyUI: React.FC = () => {
  const [contractSource, setContractSource] = useState<'project' | 'address'>('project');
  const [functionMode, setFunctionMode] = useState<'function' | 'raw'>('function');
  const [usePendingBlock, setUsePendingBlock] = useState(true);
  const [overrideBlockNumber, setOverrideBlockNumber] = useState(false);
  const [overrideTimestamp, setOverrideTimestamp] = useState(false);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header with title */}
      <div className="px-8 py-6">
        <h1 className="text-2xl font-semibold text-white mb-0">New Simulation</h1>
      </div>

      {/* Main content grid */}
      <div className="px-8 pb-8">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 max-w-7xl">
          
          {/* Left Column - Contract */}
          <div>
            <div className="bg-[#1a1a1a] rounded-lg border border-gray-700 p-6">
              <h2 className="text-lg font-medium text-white mb-6">Contract</h2>
              
              {/* Radio buttons for contract source */}
              <div className="flex items-center gap-6 mb-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    value="project"
                    checked={contractSource === 'project'}
                    onChange={(e) => setContractSource(e.target.value as 'project')}
                    className="w-4 h-4 text-blue-500 border-gray-500 focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-white text-sm">Select from Project</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    value="address"
                    checked={contractSource === 'address'}
                    onChange={(e) => setContractSource(e.target.value as 'address')}
                    className="w-4 h-4 text-blue-500 border-gray-500 focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-white text-sm">Insert any address</span>
                </label>
              </div>

              {/* Contract dropdown and edit source */}
              <div className="mb-6">
                <div className="flex gap-3 mb-3">
                  <div className="relative flex-1">
                    <select className="w-full bg-[#2a2a2a] border border-gray-600 rounded-md px-4 py-3 text-white text-sm appearance-none pr-10">
                      <option>Diamond</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <button className="bg-[#2a2a2a] border border-gray-600 rounded-md px-4 py-3 text-blue-400 text-sm hover:bg-[#3a3a3a]">
                    Edit source
                  </button>
                </div>
              </div>

              {/* Function selection radio buttons */}
              <div className="flex items-center gap-6 mb-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    value="function"
                    checked={functionMode === 'function'}
                    onChange={(e) => setFunctionMode(e.target.value as 'function')}
                    className="w-4 h-4 text-blue-500 border-gray-500 focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-white text-sm">Choose function and parameters</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    value="raw"
                    checked={functionMode === 'raw'}
                    onChange={(e) => setFunctionMode(e.target.value as 'raw')}
                    className="w-4 h-4 text-blue-500 border-gray-500 focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-white text-sm">Enter raw input data</span>
                </label>
              </div>

              {/* Function dropdown and edit ABI */}
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <select className="w-full bg-[#2a2a2a] border border-gray-600 rounded-md px-4 py-3 text-white text-sm appearance-none pr-10">
                    <option>Select option</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                <button className="bg-[#2a2a2a] border border-gray-600 rounded-md px-4 py-3 text-blue-400 text-sm hover:bg-[#3a3a3a]">
                  Edit ABI
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Transaction Parameters */}
          <div>
            <div className="bg-[#1a1a1a] rounded-lg border border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium text-white">Transaction Parameters</h2>
                <button className="p-1">
                  <Settings className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Use Pending Block toggle */}
              <div className="flex items-center gap-2 mb-6">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={usePendingBlock}
                    onChange={(e) => setUsePendingBlock(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="relative w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
                <span className="text-white text-sm">Use Pending Block</span>
              </div>

              {/* Block Number and Tx Index */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Block Number</label>
                  <input
                    type="text"
                    placeholder="/"
                    className="w-full bg-[#2a2a2a] border border-gray-600 rounded-md px-3 py-2 text-white text-sm placeholder-gray-500"
                  />
                  <div className="text-xs text-gray-500 mt-1">Current block: 30930267</div>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Tx Index</label>
                  <input
                    type="text"
                    placeholder="/"
                    className="w-full bg-[#2a2a2a] border border-gray-600 rounded-md px-3 py-2 text-white text-sm placeholder-gray-500"
                  />
                  <div className="text-xs text-gray-500 mt-1">Maximum Block Index: 14</div>
                </div>
              </div>

              {/* From */}
              <div className="mb-6">
                <label className="block text-gray-400 text-sm mb-2">From</label>
                <input
                  type="text"
                  defaultValue="0x0000000000000000000000000000000000000000"
                  className="w-full bg-[#2a2a2a] border border-gray-600 rounded-md px-3 py-2 text-white text-sm font-mono"
                />
              </div>

              {/* Gas and Gas Price */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Gas</label>
                  <input
                    type="text"
                    defaultValue="800000"
                    className="w-full bg-[#2a2a2a] border border-gray-600 rounded-md px-3 py-2 text-white text-sm"
                  />
                  <button className="text-xs text-blue-400 hover:text-blue-300 mt-1">
                    Use custom gas value
                  </button>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Gas Price</label>
                  <input
                    type="text"
                    defaultValue="0"
                    className="w-full bg-[#2a2a2a] border border-gray-600 rounded-md px-3 py-2 text-white text-sm"
                  />
                </div>
              </div>

              {/* Value */}
              <div className="mb-6">
                <label className="block text-gray-400 text-sm mb-2">Value</label>
                <input
                  type="text"
                  defaultValue="0"
                  className="w-full bg-[#2a2a2a] border border-gray-600 rounded-md px-3 py-2 text-white text-sm"
                />
              </div>

              {/* Block Header Overrides */}
              <div className="mb-6">
                <h3 className="flex items-center justify-between text-white text-lg font-medium mb-4">
                  <span>Block Header Overrides</span>
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-2 mb-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overrideBlockNumber}
                        onChange={(e) => setOverrideBlockNumber(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 bg-[#2a2a2a] text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-white text-sm">Override Block Number</span>
                    </label>
                    <input
                      type="text"
                      placeholder="/"
                      className="w-full bg-[#2a2a2a] border border-gray-600 rounded-md px-3 py-2 text-white text-sm placeholder-gray-500"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 mb-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overrideTimestamp}
                        onChange={(e) => setOverrideTimestamp(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 bg-[#2a2a2a] text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-white text-sm">Override Timestamp</span>
                    </label>
                    <input
                      type="text"
                      placeholder="/"
                      className="w-full bg-[#2a2a2a] border border-gray-600 rounded-md px-3 py-2 text-white text-sm placeholder-gray-500"
                    />
                  </div>
                </div>
              </div>

              {/* State Overrides */}
              <div className="mb-6">
                <h3 className="flex items-center justify-between text-white text-lg font-medium">
                  <span>State Overrides</span>
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                </h3>
              </div>

              {/* Optional Access Lists */}
              <div className="mb-8">
                <h3 className="flex items-center justify-between text-white text-lg font-medium">
                  <span>Optional Access Lists</span>
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                </h3>
              </div>
            </div>
          </div>
        </div>

        {/* Simulate Transaction Button */}
        <div className="flex justify-end mt-8">
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-md font-medium">
            Simulate Transaction
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExactTenderlyUI;