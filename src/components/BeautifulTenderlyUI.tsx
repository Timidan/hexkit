import React, { useState } from "react";
import {
  ChevronDown,
  Settings,
  Play,
  Edit3,
  Code,
  Zap,
  Layers,
  Database,
  Shield,
} from "lucide-react";

const BeautifulTenderlyUI: React.FC = () => {
  const [contractSource, setContractSource] = useState<"project" | "address">(
    "project"
  );
  const [functionMode, setFunctionMode] = useState<"function" | "raw">(
    "function"
  );
  const [usePendingBlock, setUsePendingBlock] = useState(true);
  const [showBlockOverrides, setShowBlockOverrides] = useState(false);
  const [showStateOverrides, setShowStateOverrides] = useState(false);
  const [showAccessLists, setShowAccessLists] = useState(false);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="px-8 py-8">
        {/* <h1 className="text-3xl font-bold text-white mb-2">New Simulation</h1>
        <p className="text-gray-400">Configure and simulate blockchain transactions</p> */}
      </div>

      {/* Main Content */}
      <div className="px-8 pb-8">
        <div className="max-w-7xl mx-auto">
          {/* Top Row - Contract & Transaction Parameters */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* LEFT: Contract Configuration */}
            <div className="space-y-6">
              <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                <div className="p-6 border-b border-gray-800">
                  <h2 className="text-xl font-semibold text-white flex items-center gap-3">
                    <Code className="w-6 h-6 text-blue-400" />
                    Contract
                  </h2>
                </div>

                <div className="p-6 space-y-6">
                  {/* Contract Source Selection Cards */}
                  <div className="space-y-3">
                    <div
                      className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                        contractSource === "project"
                          ? "border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20"
                          : "border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800/70"
                      }`}
                      onClick={() => setContractSource("project")}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            contractSource === "project"
                              ? "border-blue-500 bg-blue-500"
                              : "border-gray-500"
                          }`}
                        >
                          {contractSource === "project" && (
                            <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-white">
                            Select from Project
                          </div>
                          <div className="text-sm text-gray-400">
                            Choose from saved contracts
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                        contractSource === "address"
                          ? "border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20"
                          : "border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800/70"
                      }`}
                      onClick={() => setContractSource("address")}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            contractSource === "address"
                              ? "border-blue-500 bg-blue-500"
                              : "border-gray-500"
                          }`}
                        >
                          {contractSource === "address" && (
                            <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-white">
                            Insert any address
                          </div>
                          <div className="text-sm text-gray-400">
                            Enter contract address manually
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contract Input */}
                  <div className="flex gap-3">
                    <select className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none">
                      <option>Diamond</option>
                      <option>ERC20 Token</option>
                      <option>NFT Contract</option>
                    </select>
                    <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors flex items-center gap-2 font-medium">
                      <Edit3 className="w-4 h-4" />
                      Edit source
                    </button>
                  </div>

                  {/* Function Mode Selection */}
                  <div className="space-y-3">
                    <div
                      className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                        functionMode === "function"
                          ? "border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20"
                          : "border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800/70"
                      }`}
                      onClick={() => setFunctionMode("function")}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            functionMode === "function"
                              ? "border-purple-500 bg-purple-500"
                              : "border-gray-500"
                          }`}
                        >
                          {functionMode === "function" && (
                            <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-white">
                            Choose function and parameters
                          </div>
                          <div className="text-sm text-gray-400">
                            Select from ABI functions
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                        functionMode === "raw"
                          ? "border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20"
                          : "border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800/70"
                      }`}
                      onClick={() => setFunctionMode("raw")}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            functionMode === "raw"
                              ? "border-purple-500 bg-purple-500"
                              : "border-gray-500"
                          }`}
                        >
                          {functionMode === "raw" && (
                            <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-white">
                            Enter raw input data
                          </div>
                          <div className="text-sm text-gray-400">
                            Provide calldata directly
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Function Selection */}
                  <div className="flex gap-3">
                    <select className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-purple-500 focus:outline-none">
                      <option>Select function</option>
                      <option>transfer(address,uint256)</option>
                      <option>approve(address,uint256)</option>
                      <option>balanceOf(address)</option>
                    </select>
                    <button className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors flex items-center gap-2 font-medium">
                      <Edit3 className="w-4 h-4" />
                      Edit ABI
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: Transaction Parameters */}
            <div>
              <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                <div className="p-6 border-b border-gray-800">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white flex items-center gap-3">
                      <Zap className="w-6 h-6 text-green-400" />
                      Transaction Parameters
                    </h2>
                    <Settings className="w-5 h-5 text-gray-400 hover:text-white cursor-pointer transition-colors" />
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Pending Block Toggle */}
                  <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">
                          Use Pending Block
                        </div>
                        <div className="text-sm text-gray-400">
                          Simulate against pending state
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={usePendingBlock}
                          onChange={(e) => setUsePendingBlock(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="relative w-12 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                      </label>
                    </div>
                  </div>

                  {/* Grid Parameters */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-300">
                        Block Number
                      </label>
                      <input
                        type="text"
                        placeholder="Latest"
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none"
                      />
                      <div className="text-xs text-gray-500">
                        Current: 30930267
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-300">
                        Tx Index
                      </label>
                      <input
                        type="text"
                        placeholder="0"
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none"
                      />
                      <div className="text-xs text-gray-500">Max: 14</div>
                    </div>
                  </div>

                  {/* From Address */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">
                      From Address
                    </label>
                    <input
                      type="text"
                      defaultValue="0x0000000000000000000000000000000000000000"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-green-500 focus:outline-none"
                    />
                  </div>

                  {/* Gas Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-300">
                        Gas Limit
                      </label>
                      <input
                        type="text"
                        defaultValue="800000"
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-green-500 focus:outline-none"
                      />
                      <button className="text-xs text-green-400 hover:text-green-300 transition-colors">
                        Use custom gas value
                      </button>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-300">
                        Gas Price
                      </label>
                      <input
                        type="text"
                        defaultValue="0"
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-green-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Value */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">
                      Value (ETH)
                    </label>
                    <input
                      type="text"
                      defaultValue="0"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-green-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row - Advanced Options */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Block Header Overrides */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
              <div
                className="p-4 border-b border-gray-800 cursor-pointer hover:bg-gray-800/50 transition-colors"
                onClick={() => setShowBlockOverrides(!showBlockOverrides)}
              >
                <h3 className="font-semibold text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Layers className="w-5 h-5 text-orange-400" />
                    Block Header Overrides
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform ${showBlockOverrides ? "rotate-180" : ""}`}
                  />
                </h3>
              </div>
              {showBlockOverrides && (
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500"
                      />
                      Override Block Number
                    </label>
                    <input
                      type="text"
                      placeholder="Block number"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-orange-500 focus:ring-orange-500"
                      />
                      Override Timestamp
                    </label>
                    <input
                      type="text"
                      placeholder="Timestamp"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* State Overrides */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
              <div
                className="p-4 border-b border-gray-800 cursor-pointer hover:bg-gray-800/50 transition-colors"
                onClick={() => setShowStateOverrides(!showStateOverrides)}
              >
                <h3 className="font-semibold text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-red-400" />
                    State Overrides
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform ${showStateOverrides ? "rotate-180" : ""}`}
                  />
                </h3>
              </div>
              {showStateOverrides ? (
                <div className="p-4">
                  <div className="text-sm text-gray-400 text-center py-6">
                    No state overrides configured
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <div className="text-sm text-gray-500 text-center py-2">
                    Click to expand
                  </div>
                </div>
              )}
            </div>

            {/* Access Lists */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
              <div
                className="p-4 border-b border-gray-800 cursor-pointer hover:bg-gray-800/50 transition-colors"
                onClick={() => setShowAccessLists(!showAccessLists)}
              >
                <h3 className="font-semibold text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-cyan-400" />
                    Optional Access Lists
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform ${showAccessLists ? "rotate-180" : ""}`}
                  />
                </h3>
              </div>
              {showAccessLists ? (
                <div className="p-4">
                  <div className="text-sm text-gray-400 text-center py-6">
                    No access lists configured
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <div className="text-sm text-gray-500 text-center py-2">
                    Click to expand
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-center">
            <button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-12 py-4 rounded-2xl font-semibold text-lg flex items-center gap-3 shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/40">
              <Play className="w-6 h-6" />
              Simulate Transaction
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BeautifulTenderlyUI;
