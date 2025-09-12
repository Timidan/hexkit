import React, { useState, useEffect } from 'react';
import { ChevronDown, Settings, Play, XCircle, Search, Loader2 } from 'lucide-react';
import { ethers } from 'ethers';
import { SUPPORTED_CHAINS } from '../utils/chains';
import type { Chain, ABIFetchResult, ContractInfo } from '../types';

const SimpleGridUI: React.FC = () => {
  const [contractSource, setContractSource] = useState<'project' | 'address'>('project');
  const [functionMode, setFunctionMode] = useState<'function' | 'raw'>('function');
  const [selectedFunctionType, setSelectedFunctionType] = useState<'read' | 'write' | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
  const [generatedCallData, setGeneratedCallData] = useState<string>('');
  const [selectedFunctionObj, setSelectedFunctionObj] = useState<ethers.utils.FunctionFragment | null>(null);
  const [functionInputs, setFunctionInputs] = useState<{[key: string]: string}>({});
  const [contractName, setContractName] = useState<string>('');
  const [tokenInfo, setTokenInfo] = useState<{symbol?: string, name?: string, decimals?: number} | null>(null);
  const [isLoadingContractInfo, setIsLoadingContractInfo] = useState(false);
  const [usePendingBlock, setUsePendingBlock] = useState(true);
  
  // Contract address and network state
  const [contractAddress, setContractAddress] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState<Chain | null>(SUPPORTED_CHAINS[0]);
  const [isLoadingABI, setIsLoadingABI] = useState(false);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [abiError, setAbiError] = useState<string | null>(null);
  const [readFunctions, setReadFunctions] = useState<ethers.utils.FunctionFragment[]>([]);
  const [writeFunctions, setWriteFunctions] = useState<ethers.utils.FunctionFragment[]>([]);

  // ABI fetching functions
  const fetchABIFromSourcery = async (address: string, chainId: number): Promise<ABIFetchResult> => {
    try {
      const response = await fetch(`https://repo.sourcify.dev/contracts/full_match/${chainId}/${address}/metadata.json`);
      if (response.ok) {
        const data = await response.json();
        return { success: true, abi: JSON.stringify(data.output.abi) };
      }
    } catch (fetchError) {
      console.log('Sourcify fetch failed:', fetchError);
    }
    return { success: false, error: 'Not found on Sourcify' };
  };

  const fetchABIFromBlockscout = async (address: string, chain: Chain): Promise<ABIFetchResult> => {
    try {
      const blockscoutExplorer = chain.explorers.find(e => e.type === 'blockscout');
      if (!blockscoutExplorer) {
        return { success: false, error: 'No Blockscout API available for this chain' };
      }
      
      const response = await fetch(`${blockscoutExplorer.url}/v2/smart-contracts/${address}`);
      if (response.ok) {
        const data = await response.json();
        if (data.abi && data.abi.length > 0) {
          return { success: true, abi: JSON.stringify(data.abi) };
        }
      }
    } catch (fetchError) {
      console.log('Blockscout fetch failed:', fetchError);
    }
    return { success: false, error: 'Not found on Blockscout' };
  };

  const fetchABIFromEtherscan = async (address: string, chain: Chain): Promise<ABIFetchResult> => {
    try {
      const etherscanExplorer = chain.explorers.find(e => e.type === 'etherscan');
      if (!etherscanExplorer) {
        return { success: false, error: 'No Etherscan API available for this chain' };
      }
      
      const response = await fetch(`${etherscanExplorer.url}?module=contract&action=getabi&address=${address}`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === '1' && data.result) {
          return { success: true, abi: data.result };
        }
      }
    } catch (fetchError) {
      console.log('Etherscan fetch failed:', fetchError);
    }
    return { success: false, error: 'Not found on Etherscan' };
  };

  const fetchContractABI = async (address: string, chain: Chain): Promise<void> => {
    if (!address || !ethers.utils.isAddress(address)) {
      setAbiError('Invalid contract address');
      return;
    }

    setIsLoadingABI(true);
    setAbiError(null);
    setContractInfo(null);
    setReadFunctions([]);
    setWriteFunctions([]);

    // Try Sourcify first
    let result = await fetchABIFromSourcery(address, chain.id);
    let source = 'Sourcify';
    
    // Try Blockscout if Sourcify fails
    if (!result.success) {
      result = await fetchABIFromBlockscout(address, chain);
      source = 'Blockscout';
    }
    
    // Try Etherscan if Blockscout fails
    if (!result.success) {
      result = await fetchABIFromEtherscan(address, chain);
      source = 'Etherscan';
    }

    setIsLoadingABI(false);

    if (result.success && result.abi) {
      try {
        const parsedABI = JSON.parse(result.abi);
        const contractInfoObj: ContractInfo = {
          address,
          chain,
          abi: result.abi,
          verified: true
        };
        
        setContractInfo(contractInfoObj);
        categorizeABIFunctions(parsedABI);
        console.log(`ABI fetched successfully from ${source}`);
        
        // Fetch token info after setting contract info
        console.log('Calling detectAndFetchTokenInfo with ABI length:', parsedABI.length);
        // Small delay to ensure contract info is set
        setTimeout(async () => {
          await detectAndFetchTokenInfo(parsedABI);
        }, 200);
      } catch (parseError) {
        console.error('ABI parsing error:', parseError);
        setAbiError('Failed to parse ABI JSON');
      }
    } else {
      setAbiError('Contract ABI not found on any source (Sourcify → Blockscout → Etherscan)');
    }
  };

  const categorizeABIFunctions = (abi: ethers.utils.Fragment[]) => {
    const reads: ethers.utils.FunctionFragment[] = [];
    const writes: ethers.utils.FunctionFragment[] = [];
    
    abi.forEach((item) => {
      if (item.type === 'function') {
        const funcFragment = item as ethers.utils.FunctionFragment;
        if (funcFragment.stateMutability === 'view' || funcFragment.stateMutability === 'pure') {
          reads.push(funcFragment);
        } else {
          writes.push(funcFragment);
        }
      }
    });
    
    setReadFunctions(reads);
    setWriteFunctions(writes);
    
    // Check if it's a token contract and fetch basic info
    detectAndFetchTokenInfo(abi);
  };
  
  const detectAndFetchTokenInfo = async (abi: ethers.utils.Fragment[]) => {
    if (!contractAddress || !selectedNetwork) {
      setContractName('Smart Contract');
      setTokenInfo(null);
      return;
    }

    setIsLoadingContractInfo(true);
    console.log('Starting contract info fetch...');
    
    const functionNames = abi
      .filter(item => item.type === 'function')
      .map(item => (item as ethers.utils.FunctionFragment).name);
    
    const isERC20 = functionNames.includes('totalSupply') && 
                   functionNames.includes('balanceOf') && 
                   functionNames.includes('transfer');
    
    const isERC721 = functionNames.includes('ownerOf') && 
                    functionNames.includes('tokenURI') && 
                    functionNames.includes('balanceOf');
    
    try {
      // Use a working RPC endpoint for Ethereum mainnet
      const rpcUrl = selectedNetwork.id === 1 ? 'https://eth.llamarpc.com' : selectedNetwork.rpcUrl;
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      const contract = new ethers.Contract(contractAddress, abi, provider);
      
      console.log('Using RPC URL:', rpcUrl);
      console.log('Contract address:', contractAddress);
      
      if (isERC20) {
        console.log('Detected ERC20 token, fetching info...');
        console.log('Calling contract methods...');
        const [name, symbol, decimals] = await Promise.all([
          contract.name().catch((err) => { console.error('Name call failed:', err); return 'Unknown Token'; }),
          contract.symbol().catch((err) => { console.error('Symbol call failed:', err); return 'UNKNOWN'; }),
          contract.decimals().catch((err) => { console.error('Decimals call failed:', err); return 18; })
        ]);
        
        console.log('Token info successfully fetched:', { name, symbol, decimals });
        setContractName(name);
        setTokenInfo({ name, symbol, decimals });
      } else if (isERC721) {
        console.log('Detected ERC721 NFT, fetching info...');
        const [name, symbol] = await Promise.all([
          contract.name().catch((err) => { console.error('NFT name call failed:', err); return 'Unknown NFT'; }),
          contract.symbol().catch((err) => { console.error('NFT symbol call failed:', err); return 'NFT'; })
        ]);
        
        console.log('NFT info successfully fetched:', { name, symbol });
        setContractName(name);
        setTokenInfo({ name, symbol, decimals: 0 });
      } else {
        // Try to get contract name if it has a name function
        try {
          const name = await contract.name();
          console.log('Contract name fetched:', name);
          setContractName(name);
          setTokenInfo(null);
        } catch {
          console.log('No name function, using generic name');
          setContractName('Smart Contract');
          setTokenInfo(null);
        }
      }
    } catch (fetchError) {
      console.error('Failed to fetch contract info:', fetchError);
      if (isERC20) {
        setContractName('ERC20 Token');
        setTokenInfo({ name: 'ERC20 Token', symbol: 'TOKEN', decimals: 18 });
      } else if (isERC721) {
        setContractName('ERC721 NFT');
        setTokenInfo({ name: 'ERC721 NFT', symbol: 'NFT', decimals: 0 });
      } else {
        setContractName('Smart Contract');
        setTokenInfo(null);
      }
    }
    
    setIsLoadingContractInfo(false);
  };
  
  const generateCallData = (functionSignature: string, inputs: string[] = []) => {
    try {
      if (!contractInfo?.abi) return '';
      
      const parsedABI = JSON.parse(contractInfo.abi);
      const targetFunction = parsedABI.find((item: { type: string; name?: string; inputs?: { type: string }[] }) => {
        if (item.type === 'function' && item.name) {
          const sig = `${item.name}(${item.inputs?.map(input => input.type).join(',') || ''})`;
          return sig === functionSignature;
        }
        return false;
      });
      
      if (!targetFunction || !targetFunction.name) return '';
      
      const iface = new ethers.utils.Interface([targetFunction]);
      const calldata = iface.encodeFunctionData(targetFunction.name, inputs);
      return calldata;
    } catch (error) {
      console.error('Calldata generation error:', error);
      return '';
    }
  };
  
  const handleFunctionSelect = (value: string) => {
    setSelectedFunction(value);
    
    if (value && value !== '' && value !== 'Select function') {
      const [type, index] = value.split('-');
      const functions = type === 'read' ? readFunctions : writeFunctions;
      const func = functions[parseInt(index)];
      
      if (func) {
        setSelectedFunctionObj(func);
        // Initialize input values for the selected function
        const initialInputs: {[key: string]: string} = {};
        func.inputs?.forEach((input, idx) => {
          initialInputs[`${func.name}_${idx}`] = '';
        });
        setFunctionInputs(initialInputs);
        
        // Generate initial calldata with empty parameters
        const signature = `${func.name}(${func.inputs?.map(input => input.type).join(',')})`;
        const emptyParams = new Array(func.inputs?.length || 0).fill('');
        const calldata = generateCallData(signature, emptyParams);
        setGeneratedCallData(calldata);
      }
    } else {
      setSelectedFunctionObj(null);
      setFunctionInputs({});
      setGeneratedCallData('');
    }
  };
  
  const updateCallData = () => {
    if (selectedFunctionObj) {
      const signature = `${selectedFunctionObj.name}(${selectedFunctionObj.inputs?.map(input => input.type).join(',')})`;
      const params = selectedFunctionObj.inputs?.map((input, idx) => 
        functionInputs[`${selectedFunctionObj.name}_${idx}`] || ''
      ) || [];
      const calldata = generateCallData(signature, params);
      setGeneratedCallData(calldata);
    }
  };
  
  const handleInputChange = (inputKey: string, value: string) => {
    setFunctionInputs(prev => ({
      ...prev,
      [inputKey]: value
    }));
    // Update calldata when inputs change
    setTimeout(updateCallData, 100);
  };

  const handleFetchABI = async () => {
    if (selectedNetwork && contractAddress) {
      await fetchContractABI(contractAddress, selectedNetwork);
    }
  };

  // Local storage functions
  const SAVED_CONTRACTS_KEY = 'web3-toolkit-saved-contracts';
  
  const saveContractToStorage = (contractInfo: ContractInfo) => {
    try {
      const existing = JSON.parse(localStorage.getItem(SAVED_CONTRACTS_KEY) || '[]');
      const contractKey = `${contractInfo.address.toLowerCase()}-${contractInfo.chain.id}`;
      
      const updated = existing.filter((c: any) => 
        `${c.address.toLowerCase()}-${c.chain.id}` !== contractKey
      );
      
      updated.unshift({
        ...contractInfo,
        savedAt: new Date().toISOString()
      });
      
      // Keep only the last 50 contracts
      const trimmed = updated.slice(0, 50);
      localStorage.setItem(SAVED_CONTRACTS_KEY, JSON.stringify(trimmed));
      
      console.log('Contract saved to local storage');
    } catch (saveError) {
      console.error('Failed to save contract:', saveError);
    }
  };
  
  const loadSavedContracts = (): ContractInfo[] => {
    try {
      return JSON.parse(localStorage.getItem(SAVED_CONTRACTS_KEY) || '[]');
    } catch (loadError) {
      console.error('Failed to load saved contracts:', loadError);
      return [];
    }
  };
  
  const loadContractFromStorage = (savedContract: ContractInfo & { savedAt?: string }) => {
    setContractAddress(savedContract.address);
    setSelectedNetwork(savedContract.chain);
    setContractInfo(savedContract);
    setAbiError(null);
    
    if (savedContract.abi) {
      try {
        const parsedABI = JSON.parse(savedContract.abi);
        categorizeABIFunctions(parsedABI);
      } catch (parseError) {
        console.error('Saved ABI parsing error:', parseError);
        setAbiError('Failed to parse saved ABI');
      }
    }
  };
  
  // Auto-save when contract info is successfully loaded
  useEffect(() => {
    if (contractInfo && contractInfo.abi) {
      saveContractToStorage(contractInfo);
    }
  }, [contractInfo]);
  
  const [savedContracts] = useState<ContractInfo[]>(loadSavedContracts());
  const [showSavedContracts, setShowSavedContracts] = useState(false);

  const cardStyle = {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '20px'
  };

  const headerStyle = {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: '8px'
  };

  const subHeaderStyle = {
    fontSize: '18px',
    fontWeight: '600',
    color: '#fff',
    marginBottom: '20px'
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '30px',
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px'
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    background: '#2a2a2a',
    border: '1px solid #555',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    marginBottom: '8px'
  };

  const buttonStyle = {
    padding: '12px 20px',
    background: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  };

  const selectionCardStyle = (isSelected: boolean) => ({
    padding: '16px',
    background: isSelected ? '#1e40af20' : '#2a2a2a',
    border: `2px solid ${isSelected ? '#007bff' : '#555'}`,
    borderRadius: '10px',
    cursor: 'pointer',
    marginBottom: '12px',
    transition: 'all 0.2s ease'
  });

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', padding: '20px' }}>
      
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={headerStyle}>New Simulation</h1>
        <p style={{ color: '#888', fontSize: '16px' }}>Configure and simulate blockchain transactions</p>
      </div>

      {/* Main Grid */}
      <div style={gridStyle}>
        
        {/* LEFT COLUMN - Contract */}
        <div style={cardStyle}>
          <h2 style={subHeaderStyle}>🔧 Contract</h2>
          
          {/* Contract Source Selection */}
          <div style={{ marginBottom: '24px' }}>
            <div 
              style={selectionCardStyle(contractSource === 'project')}
              onClick={() => setContractSource('project')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  width: '16px', 
                  height: '16px', 
                  borderRadius: '50%', 
                  border: '2px solid #007bff',
                  background: contractSource === 'project' ? '#007bff' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {contractSource === 'project' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }}></div>}
                </div>
                <div>
                  <div style={{ fontWeight: '500' }}>Select from Project</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>Choose from saved contracts</div>
                </div>
              </div>
            </div>

            <div 
              style={selectionCardStyle(contractSource === 'address')}
              onClick={() => setContractSource('address')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  width: '16px', 
                  height: '16px', 
                  borderRadius: '50%', 
                  border: '2px solid #007bff',
                  background: contractSource === 'address' ? '#007bff' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {contractSource === 'address' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }}></div>}
                </div>
                <div>
                  <div style={{ fontWeight: '500' }}>Insert any address</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>Enter contract address manually</div>
                </div>
              </div>
            </div>
          </div>

          {/* Contract Input */}
          {contractSource === 'project' ? (
            <div style={{ marginBottom: '24px' }}>
              {savedContracts.length > 0 ? (
                <>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <select 
                      style={{ ...inputStyle, flex: 1 }}
                      onChange={(e) => {
                        const index = parseInt(e.target.value);
                        if (!isNaN(index) && savedContracts[index]) {
                          loadContractFromStorage(savedContracts[index]);
                          setContractSource('address'); // Switch to address mode to show details
                        }
                      }}
                    >
                      <option value="">Select saved contract...</option>
                      {savedContracts.map((contract, index) => (
                        <option key={index} value={index}>
                          {contract.name || `${contract.address.slice(0, 6)}...${contract.address.slice(-4)}`} on {contract.chain.name}
                        </option>
                      ))}
                    </select>
                    <button 
                      style={buttonStyle}
                      onClick={() => setShowSavedContracts(!showSavedContracts)}
                    >
                      {showSavedContracts ? 'Hide' : 'Show'} All
                    </button>
                  </div>
                  
                  {showSavedContracts && (
                    <div style={{ 
                      maxHeight: '200px', 
                      overflowY: 'auto', 
                      background: '#2a2a2a', 
                      borderRadius: '8px', 
                      padding: '12px',
                      marginBottom: '16px'
                    }}>
                      {savedContracts.map((contract, index) => (
                        <div 
                          key={index}
                          style={{
                            padding: '8px 12px',
                            marginBottom: '8px',
                            background: '#1a1a1a',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            border: '1px solid #333'
                          }}
                          onClick={() => {
                            loadContractFromStorage(contract);
                            setContractSource('address');
                            setShowSavedContracts(false);
                          }}
                        >
                          <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                            {contract.name || 'Unnamed Contract'}
                          </div>
                          <div style={{ fontSize: '12px', color: '#888', fontFamily: 'monospace' }}>
                            {contract.address} on {contract.chain.name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                            Saved: {new Date((contract as ContractInfo & { savedAt?: string }).savedAt || Date.now()).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ 
                  padding: '20px', 
                  background: '#2a2a2a', 
                  borderRadius: '8px', 
                  textAlign: 'center',
                  marginBottom: '16px'
                }}>
                  <div style={{ color: '#888', marginBottom: '8px' }}>No saved contracts</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    Use "Insert any address" to fetch and save contracts
                  </div>
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '12px' }}>
                <select style={{ ...inputStyle, flex: 1 }} disabled>
                  <option>Use saved contracts above</option>
                </select>
                <button style={{ ...buttonStyle, opacity: 0.5 }} disabled>Edit source</button>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: '24px' }}>
              {/* Network Selection */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>Network</label>
                <select 
                  style={inputStyle}
                  value={selectedNetwork?.id || ''}
                  onChange={(e) => {
                    const chainId = parseInt(e.target.value);
                    const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
                    setSelectedNetwork(chain || null);
                  }}
                >
                  {SUPPORTED_CHAINS.map(chain => (
                    <option key={chain.id} value={chain.id}>{chain.name}</option>
                  ))}
                </select>
              </div>
              
              {/* Contract Address Input */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>Contract Address</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input 
                    type="text"
                    placeholder="0x..."
                    value={contractAddress}
                    onChange={(e) => setContractAddress(e.target.value)}
                    style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                  />
                  <button 
                    style={{
                      ...buttonStyle,
                      background: isLoadingABI ? '#666' : '#22c55e',
                      cursor: isLoadingABI ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    onClick={handleFetchABI}
                    disabled={isLoadingABI || !contractAddress || !selectedNetwork}
                  >
                    {isLoadingABI ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    {isLoadingABI ? 'Fetching...' : 'Fetch ABI'}
                  </button>
                </div>
              </div>
              
              {/* ABI Status */}
              {isLoadingABI && (
                <div style={{ padding: '12px', background: '#2a2a2a', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22c55e' }}>
                    <Loader2 size={16} className="animate-spin" />
                    <span style={{ fontSize: '14px' }}>Checking Sourcify → Blockscout → Etherscan...</span>
                  </div>
                </div>
              )}
              
              {abiError && (
                <div style={{ padding: '12px', background: '#dc262620', border: '1px solid #dc2626', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626' }}>
                    <XCircle size={16} />
                    <span style={{ fontSize: '14px' }}>{abiError}</span>
                  </div>
                </div>
              )}
              
              {contractInfo && (
                <div style={{ padding: '16px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', marginBottom: '16px' }}>
                  {isLoadingContractInfo && (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px', 
                      marginBottom: '12px',
                      padding: '8px',
                      background: '#2a2a2a',
                      borderRadius: '6px'
                    }}>
                      <Loader2 size={16} style={{ color: '#22c55e', animation: 'spin 1s linear infinite' }} />
                      <span style={{ fontSize: '12px', color: '#22c55e' }}>Fetching contract details...</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      borderRadius: '12px', 
                      background: tokenInfo ? 
                        ((tokenInfo.decimals || 0) === 0 ? 
                          'linear-gradient(135deg, #f59e0b, #d97706)' : 
                          'linear-gradient(135deg, #10b981, #059669)'
                        ) : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      border: '2px solid rgba(255,255,255,0.1)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                    }}>
                      {tokenInfo ? (
                        (tokenInfo.decimals || 0) === 0 ? '🎨' : '💰'
                      ) : '📋'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '18px', color: '#fff', marginBottom: '6px' }}>
                        {contractName}
                      </div>
                      {tokenInfo ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ 
                            fontSize: '14px', 
                            color: (tokenInfo.decimals || 0) === 0 ? '#f59e0b' : '#10b981', 
                            fontWeight: '600',
                            padding: '2px 8px',
                            background: (tokenInfo.decimals || 0) === 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            borderRadius: '6px',
                            display: 'inline-block',
                            width: 'fit-content'
                          }}>
                            {(tokenInfo.decimals || 0) === 0 ? '🎨 ERC721 NFT' : '💰 ERC20 Token'}
                          </div>
                          <div style={{ fontSize: '13px', color: '#ccc', fontWeight: '500' }}>
                            Symbol: {tokenInfo.symbol}
                            {(tokenInfo.decimals || 0) > 0 && ` • ${tokenInfo.decimals} decimals`}
                          </div>
                        </div>
                      ) : (
                        <div style={{ 
                          fontSize: '13px', 
                          color: '#6366f1',
                          fontWeight: '500',
                          padding: '2px 8px',
                          background: 'rgba(99, 102, 241, 0.1)',
                          borderRadius: '6px',
                          display: 'inline-block',
                          width: 'fit-content'
                        }}>
                          📋 Smart Contract
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '12px',
                    borderTop: '1px solid #333'
                  }}>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                      <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        📖 {readFunctions.length} read functions
                      </span>
                      <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        ✍️ {writeFunctions.length} write functions
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#666' }}>
                      {selectedNetwork?.name}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Contract Function Selection - Inside Contract Container */}
              {(readFunctions.length > 0 || writeFunctions.length > 0) && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #333' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#ccc', marginBottom: '12px' }}>Contract Function</h4>
                  
                  {/* Function Mode Selection */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                    <div 
                      style={{
                        padding: '8px',
                        background: functionMode === 'function' ? '#9333ea20' : '#2a2a2a',
                        border: `1px solid ${functionMode === 'function' ? '#9333ea' : '#444'}`,
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                      onClick={() => setFunctionMode('function')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ 
                          width: '10px', 
                          height: '10px', 
                          borderRadius: '50%', 
                          background: functionMode === 'function' ? '#9333ea' : 'transparent',
                          border: '2px solid #9333ea'
                        }}></div>
                        <div>
                          <div style={{ fontWeight: '500', fontSize: '12px', color: '#fff' }}>Choose function</div>
                          <div style={{ fontSize: '10px', color: '#888' }}>Select from ABI</div>
                        </div>
                      </div>
                    </div>
                    
                    <div 
                      style={{
                        padding: '8px',
                        background: functionMode === 'raw' ? '#9333ea20' : '#2a2a2a',
                        border: `1px solid ${functionMode === 'raw' ? '#9333ea' : '#444'}`,
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                      onClick={() => setFunctionMode('raw')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ 
                          width: '10px', 
                          height: '10px', 
                          borderRadius: '50%', 
                          background: functionMode === 'raw' ? '#9333ea' : 'transparent',
                          border: '2px solid #9333ea'
                        }}></div>
                        <div>
                          <div style={{ fontWeight: '500', fontSize: '12px', color: '#fff' }}>Raw input data</div>
                          <div style={{ fontSize: '10px', color: '#888' }}>Direct calldata</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {functionMode === 'function' && (
                    <>
                      {/* Function Type Selection */}
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#ccc', marginBottom: '6px' }}>Function Type</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                          {readFunctions.length > 0 && (
                            <div 
                              style={{
                                padding: '6px 8px',
                                background: selectedFunctionType === 'read' ? '#22c55e20' : '#2a2a2a',
                                border: `1px solid ${selectedFunctionType === 'read' ? '#22c55e' : '#444'}`,
                                borderRadius: '4px',
                                cursor: 'pointer',
                                textAlign: 'center'
                              }}
                              onClick={() => setSelectedFunctionType('read')}
                            >
                              <div style={{ fontSize: '11px', fontWeight: '500', color: selectedFunctionType === 'read' ? '#22c55e' : '#ccc' }}>📖 Read ({readFunctions.length})</div>
                            </div>
                          )}
                          {writeFunctions.length > 0 && (
                            <div 
                              style={{
                                padding: '6px 8px',
                                background: selectedFunctionType === 'write' ? '#f59e0b20' : '#2a2a2a',
                                border: `1px solid ${selectedFunctionType === 'write' ? '#f59e0b' : '#444'}`,
                                borderRadius: '4px',
                                cursor: 'pointer',
                                textAlign: 'center'
                              }}
                              onClick={() => setSelectedFunctionType('write')}
                            >
                              <div style={{ fontSize: '11px', fontWeight: '500', color: selectedFunctionType === 'write' ? '#f59e0b' : '#ccc' }}>✍️ Write ({writeFunctions.length})</div>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Function Dropdown */}
                      {selectedFunctionType && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ display: 'block', fontSize: '12px', color: '#ccc', marginBottom: '6px' }}>Select Function</label>
                          <select 
                            style={{ ...inputStyle, fontSize: '12px' }}
                            onChange={(e) => handleFunctionSelect(e.target.value)}
                            value={selectedFunction || ''}
                          >
                            <option value="">Choose function...</option>
                            {selectedFunctionType === 'read' && readFunctions.length > 0 && 
                              readFunctions.map((func, index) => (
                                <option key={`read-${index}`} value={`read-${index}`}>
                                  {func.name}({func.inputs?.map((input: { type: string }) => input.type).join(',')})
                                </option>
                              ))
                            }
                            {selectedFunctionType === 'write' && writeFunctions.length > 0 && 
                              writeFunctions.map((func, index) => (
                                <option key={`write-${index}`} value={`write-${index}`}>
                                  {func.name}({func.inputs?.map((input: { type: string }) => input.type).join(',')})
                                </option>
                              ))
                            }
                          </select>
                        </div>
                      )}
                      
                      {/* Function Parameters */}
                      {selectedFunctionObj && selectedFunctionObj.inputs && selectedFunctionObj.inputs.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ display: 'block', fontSize: '12px', color: '#ccc', marginBottom: '6px' }}>Function Parameters</label>
                          {selectedFunctionObj.inputs.map((input, idx) => (
                            <div key={idx} style={{ marginBottom: '8px' }}>
                              <label style={{ display: 'block', fontSize: '11px', color: '#999', marginBottom: '4px' }}>
                                {input.name || `param${idx}`} ({input.type})
                              </label>
                              <input
                                type="text"
                                placeholder={`Enter ${input.type} value`}
                                value={functionInputs[`${selectedFunctionObj.name}_${idx}`] || ''}
                                onChange={(e) => handleInputChange(`${selectedFunctionObj.name}_${idx}`, e.target.value)}
                                style={{
                                  ...inputStyle,
                                  fontSize: '11px',
                                  padding: '6px 8px',
                                  marginBottom: '0'
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Dynamic Calldata Display - Compact */}
                      {selectedFunctionObj && generatedCallData && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <label style={{ fontSize: '11px', color: '#ccc' }}>Calldata</label>
                            <button
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#888',
                                cursor: 'pointer',
                                fontSize: '12px',
                                padding: '2px'
                              }}
                              onClick={() => navigator.clipboard.writeText(generatedCallData)}
                              title="Copy calldata"
                            >
                              📋
                            </button>
                          </div>
                          <div style={{
                            background: '#0a0a0a',
                            border: '1px solid #333',
                            borderRadius: '3px',
                            padding: '6px 8px',
                            maxHeight: '60px',
                            overflowY: 'auto'
                          }}>
                            <div style={{
                              fontFamily: 'monospace',
                              fontSize: '9px',
                              color: '#22c55e',
                              wordBreak: 'break-all',
                              lineHeight: '1.1'
                            }}>
                              {generatedCallData}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}



        </div>

        {/* RIGHT COLUMN - Transaction Parameters */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={subHeaderStyle}>⚡ Transaction Parameters</h2>
            <Settings size={20} style={{ color: '#888', cursor: 'pointer' }} />
          </div>

          {/* Use Pending Block */}
          <div style={{ 
            padding: '16px', 
            background: '#2a2a2a', 
            borderRadius: '10px', 
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontWeight: '500', marginBottom: '4px' }}>Use Pending Block</div>
              <div style={{ fontSize: '12px', color: '#888' }}>Simulate against pending state</div>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
              <input
                type="checkbox"
                checked={usePendingBlock}
                onChange={(e) => setUsePendingBlock(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <div style={{
                position: 'absolute',
                cursor: 'pointer',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: usePendingBlock ? '#22c55e' : '#6b7280',
                transition: '0.4s',
                borderRadius: '24px'
              }}>
                <div style={{
                  position: 'absolute',
                  content: '',
                  height: '18px',
                  width: '18px',
                  left: usePendingBlock ? '23px' : '3px',
                  bottom: '3px',
                  backgroundColor: '#fff',
                  transition: '0.4s',
                  borderRadius: '50%'
                }}></div>
              </div>
            </label>
          </div>

          {/* Parameters Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>Block Number</label>
              <input type="text" placeholder="Latest" style={inputStyle} />
              <div style={{ fontSize: '12px', color: '#888' }}>Current: 30930267</div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>Tx Index</label>
              <input type="text" placeholder="0" style={inputStyle} />
              <div style={{ fontSize: '12px', color: '#888' }}>Max: 14</div>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>From Address</label>
            <input 
              type="text" 
              defaultValue="0x0000000000000000000000000000000000000000" 
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>Gas Limit</label>
              <input type="text" defaultValue="800000" style={inputStyle} />
              <button style={{ fontSize: '12px', color: '#22c55e', background: 'none', border: 'none', cursor: 'pointer' }}>
                Use custom gas value
              </button>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>Gas Price</label>
              <input type="text" defaultValue="0" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', color: '#ccc', marginBottom: '8px' }}>Value (ETH)</label>
            <input type="text" defaultValue="0" style={inputStyle} />
          </div>

          {/* Advanced Options - Inside Transaction Parameters Container */}
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #333' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#ccc', marginBottom: '12px' }}>Advanced Options</h4>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              {/* Block Header Overrides */}
              <div style={{ 
                padding: '8px 12px', 
                background: '#2a2a2a', 
                border: '1px solid #444',
                borderRadius: '6px',
                cursor: 'pointer'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px' }}>🔶</span>
                    <span style={{ fontSize: '12px', fontWeight: '500', color: '#fff' }}>Block Header Overrides</span>
                  </div>
                  <ChevronDown size={12} style={{ color: '#888' }} />
                </div>
                <div style={{ fontSize: '10px', color: '#888', marginTop: '2px', marginLeft: '18px' }}>
                  Click to configure block header parameters
                </div>
              </div>

              {/* State Overrides */}
              <div style={{ 
                padding: '8px 12px', 
                background: '#2a2a2a', 
                border: '1px solid #444',
                borderRadius: '6px',
                cursor: 'pointer'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px' }}>🗄️</span>
                    <span style={{ fontSize: '12px', fontWeight: '500', color: '#fff' }}>State Overrides</span>
                  </div>
                  <ChevronDown size={12} style={{ color: '#888' }} />
                </div>
                <div style={{ fontSize: '10px', color: '#888', marginTop: '2px', marginLeft: '18px' }}>
                  No state overrides configured
                </div>
              </div>

              {/* Access Lists */}
              <div style={{ 
                padding: '8px 12px', 
                background: '#2a2a2a', 
                border: '1px solid #444',
                borderRadius: '6px',
                cursor: 'pointer'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px' }}>🛡️</span>
                    <span style={{ fontSize: '12px', fontWeight: '500', color: '#fff' }}>Access Lists</span>
                  </div>
                  <ChevronDown size={12} style={{ color: '#888' }} />
                </div>
                <div style={{ fontSize: '10px', color: '#888', marginTop: '2px', marginLeft: '18px' }}>
                  No access lists configured
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>



      {/* Action Button */}
      <div style={{ textAlign: 'center' }}>
        <button style={{
          padding: '16px 48px',
          background: 'linear-gradient(135deg, #007bff 0%, #9333ea 100%)',
          color: '#fff',
          border: 'none',
          borderRadius: '12px',
          fontSize: '16px',
          fontWeight: '600',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 20px rgba(0, 123, 255, 0.3)'
        }}>
          <Play size={20} />
          Simulate Transaction
        </button>
      </div>
    </div>
  );
};

export default SimpleGridUI;