import React, { useState } from 'react';
import { 
  ChevronDown, 
  Settings, 
  Play,
  Edit3,
  Code,
  Zap
} from 'lucide-react';

const TenderlyGridUI: React.FC = () => {
  const [contractSource, setContractSource] = useState<'project' | 'address'>('project');
  const [functionMode, setFunctionMode] = useState<'function' | 'raw'>('function');
  const [usePendingBlock, setUsePendingBlock] = useState(true);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="px-8 py-6 border-b border-gray-800">
        <h1 className="text-2xl font-semibold text-white">NEW BEAUTIFUL TENDERLY GRID UI</h1>
      </div>

      {/* Main Grid Layout */}
      <div className="p-8">
        <div className="grid grid-cols-12 gap-6 max-w-7xl mx-auto">
          
          {/* Contract Selection - Left Side */}
          <div className="col-span-12 lg:col-span-6">
            <div className="bg-[#111111] rounded-xl border border-gray-700/50 overflow-hidden">
              <div className="p-6 border-b border-gray-700/30">
                <h2 className="text-lg font-medium text-white flex items-center gap-2">
                  <Code className="w-5 h-5 text-blue-400" />
                  Contract
                </h2>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Contract Source Cards */}
                <div className="grid grid-cols-1 gap-3">
                  <div 
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      contractSource === 'project' 
                        ? 'border-blue-500 bg-blue-500/10' 
                        : 'border-gray-600 bg-gray-800/30 hover:border-gray-500'
                    }`}
                    onClick={() => setContractSource('project')}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        contractSource === 'project' 
                          ? 'border-blue-500 bg-blue-500' 
                          : 'border-gray-500'
                      }`}>
                        {contractSource === 'project' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                      </div>
                      <span className="font-medium">Select from Project</span>
                    </div>
                  </div>
                  
                  <div 
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      contractSource === 'address' 
                        ? 'border-blue-500 bg-blue-500/10' 
                        : 'border-gray-600 bg-gray-800/30 hover:border-gray-500'
                    }`}
                    onClick={() => setContractSource('address')}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        contractSource === 'address' 
                          ? 'border-blue-500 bg-blue-500' 
                          : 'border-gray-500'
                      }`}>
                        {contractSource === 'address' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                      </div>
                      <span className="font-medium">Insert any address</span>
                    </div>
                  </div>
                </div>

                {/* Contract Input */}
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <select className="flex-1 bg-[#1a1a1a] border border-gray-600 rounded-lg px-4 py-3 text-white">
                      <option>Diamond</option>
                    </select>
                    <button className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2">
                      <Edit3 className="w-4 h-4" />
                      Edit source
                    </button>
                  </div>
                </div>

                {/* Function Selection Cards */}
                <div className="grid grid-cols-1 gap-3">
                  <div 
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      functionMode === 'function' 
                        ? 'border-blue-500 bg-blue-500/10' 
                        : 'border-gray-600 bg-gray-800/30 hover:border-gray-500'
                    }`}
                    onClick={() => setFunctionMode('function')}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        functionMode === 'function' 
                          ? 'border-blue-500 bg-blue-500' 
                          : 'border-gray-500'
                      }`}>
                        {functionMode === 'function' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                      </div>
                      <span className="font-medium">Choose function and parameters</span>
                    </div>
                  </div>
                  
                  <div 
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      functionMode === 'raw' 
                        ? 'border-blue-500 bg-blue-500/10' 
                        : 'border-gray-600 bg-gray-800/30 hover:border-gray-500'
                    }`}
                    onClick={() => setFunctionMode('raw')}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        functionMode === 'raw' 
                          ? 'border-blue-500 bg-blue-500' 
                          : 'border-gray-500'
                      }`}>
                        {functionMode === 'raw' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                      </div>
                      <span className="font-medium">Enter raw input data</span>
                    </div>
                  </div>
                </div>

                {/* Function Dropdown */}
                <div className="flex gap-3">
                  <select className="flex-1 bg-[#1a1a1a] border border-gray-600 rounded-lg px-4 py-3 text-white">
                    <option>Select function</option>
                  </select>
                  <button className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2">
                    <Edit3 className="w-4 h-4" />
                    Edit ABI
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Parameters - Right Side */}
          <div className="col-span-12 lg:col-span-6">
            <div className="bg-[#111111] rounded-xl border border-gray-700/50 overflow-hidden">
              <div className="p-6 border-b border-gray-700/30">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-purple-400" />
                    Transaction Parameters
                  </h2>
                  <Settings className="w-5 h-5 text-gray-400 hover:text-white cursor-pointer" />
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Pending Block Toggle Card */}
                <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-600">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Use Pending Block</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={usePendingBlock}
                        onChange={(e) => setUsePendingBlock(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="relative w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>

                {/* Grid of Parameter Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400 font-medium">Block Number</label>
                    <input 
                      type="text" 
                      placeholder="/"
                      className="w-full bg-[#1a1a1a] border border-gray-600 rounded-lg px-3 py-3 text-white text-sm"
                    />
                    <div className="text-xs text-gray-500">Current: 30930267</div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400 font-medium">Tx Index</label>
                    <input 
                      type="text" 
                      placeholder="/"
                      className="w-full bg-[#1a1a1a] border border-gray-600 rounded-lg px-3 py-3 text-white text-sm"
                    />
                    <div className="text-xs text-gray-500">Max Index: 14</div>
                  </div>
                </div>

                {/* From Address */}
                <div className="space-y-2">
                  <label className="text-sm text-gray-400 font-medium">From</label>
                  <input 
                    type="text" 
                    defaultValue="0x0000000000000000000000000000000000000000"
                    className="w-full bg-[#1a1a1a] border border-gray-600 rounded-lg px-3 py-3 text-white text-sm font-mono"
                  />
                </div>

                {/* Gas Parameters Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400 font-medium">Gas</label>
                    <input 
                      type="text" 
                      defaultValue="800000"
                      className="w-full bg-[#1a1a1a] border border-gray-600 rounded-lg px-3 py-3 text-white text-sm"
                    />
                    <button className="text-xs text-blue-400 hover:text-blue-300">
                      Use custom gas value
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400 font-medium">Gas Price</label>
                    <input 
                      type="text" 
                      defaultValue="0"
                      className="w-full bg-[#1a1a1a] border border-gray-600 rounded-lg px-3 py-3 text-white text-sm"
                    />
                  </div>
                </div>

                {/* Value */}
                <div className="space-y-2">
                  <label className="text-sm text-gray-400 font-medium">Value</label>
                  <input 
                    type="text" 
                    defaultValue="0"
                    className="w-full bg-[#1a1a1a] border border-gray-600 rounded-lg px-3 py-3 text-white text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Options - Full Width */}
          <div className="col-span-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Block Header Overrides */}
              <div className="bg-[#111111] rounded-xl border border-gray-700/50 overflow-hidden">
                <div className="p-4 border-b border-gray-700/30">
                  <h3 className="font-medium text-white flex items-center justify-between">
                    Block Header Overrides
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="w-4 h-4 rounded border-gray-600 bg-[#1a1a1a] text-blue-600" />
                      Override Block Number
                    </label>
                    <input 
                      type="text" 
                      placeholder="/"
                      className="w-full bg-[#1a1a1a] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="w-4 h-4 rounded border-gray-600 bg-[#1a1a1a] text-blue-600" />
                      Override Timestamp
                    </label>
                    <input 
                      type="text" 
                      placeholder="/"
                      className="w-full bg-[#1a1a1a] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* State Overrides */}
              <div className="bg-[#111111] rounded-xl border border-gray-700/50 overflow-hidden">
                <div className="p-4 border-b border-gray-700/30">
                  <h3 className="font-medium text-white flex items-center justify-between">
                    State Overrides
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </h3>
                </div>
                <div className="p-4">
                  <div className="text-sm text-gray-400 text-center py-8">
                    No state overrides configured
                  </div>
                </div>
              </div>

              {/* Access Lists */}
              <div className="bg-[#111111] rounded-xl border border-gray-700/50 overflow-hidden">
                <div className="p-4 border-b border-gray-700/30">
                  <h3 className="font-medium text-white flex items-center justify-between">
                    Optional Access Lists
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </h3>
                </div>
                <div className="p-4">
                  <div className="text-sm text-gray-400 text-center py-8">
                    No access lists configured
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Simulate Button - Full Width */}
          <div className="col-span-12">
            <div className="flex justify-center">
              <button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-medium flex items-center gap-3 text-lg shadow-lg shadow-blue-600/25">
                <Play className="w-5 h-5" />
                Simulate Transaction
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenderlyGridUI;