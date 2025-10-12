import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { 
  SearchIcon, 
  DatabaseIcon, 
  HashtagIcon, 
  PlusIcon, 
  TrashIcon,
  FolderOpenIcon,
  XCircleIcon,
  ToolIcon,
  PenToolIcon,
  FileTextIcon
} from './icons/IconLibrary';
import {
  Download,
  Upload,
  Building2
} from 'lucide-react';
import InlineCopyButton from './ui/InlineCopyButton';
import {
  lookupFunctionSignatures,
  lookupEventSignatures,
  searchSignatures,
  cacheSignature,
  getCachedSignatures,
  saveCustomSignature,
  getCustomSignatures,
  clearSignatureCache,
  type SignatureResponse,
  type SearchResponse,
  type CustomSignature
} from '../utils/signatureDatabase';

type TabType = 'lookup' | 'search' | 'custom' | 'cache';

const SignatureDatabase: React.FC = () => {
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (clipError) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (fallbackError) {
        console.warn('Failed to copy to clipboard', fallbackError || clipError);
      }
    }
  };

  const [activeTab, setActiveTab] = useState<TabType>('lookup');
  
  // Lookup tab state
  const [lookupInput, setLookupInput] = useState('');
  const [lookupType, setLookupType] = useState<'function' | 'event'>('function');
  const [lookupResults, setLookupResults] = useState<SignatureResponse | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  
  // Search tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  // Custom signatures state
  const [customSignature, setCustomSignature] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customProject, setCustomProject] = useState('');
  const [customSignatures, setCustomSignatures] = useState<CustomSignature[]>([]);
  
  // ABI import state
  const [abiInput, setAbiInput] = useState('');
  const [contractPath, setContractPath] = useState('');
  const [extractedSignatures, setExtractedSignatures] = useState<{functions: string[], events: string[]}>({functions: [], events: []});
  const [isExtracting, setIsExtracting] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [parsedContracts, setParsedContracts] = useState<{[contractName: string]: {abi: any[], functions: string[], events: string[], fileName: string}}>({});
  const [selectedContracts, setSelectedContracts] = useState<string[]>([]);
  
  // Cache state
  const [cachedFunctions, setCachedFunctions] = useState<any>({});
  const [cachedEvents, setCachedEvents] = useState<any>({});
  
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCachedData();
  }, []);

  const loadCachedData = () => {
    setCachedFunctions(getCachedSignatures('function'));
    setCachedEvents(getCachedSignatures('event'));
    setCustomSignatures(getCustomSignatures());
  };

  const handleLookup = async () => {
    if (!lookupInput.trim()) {
      setError('Please enter a signature hash');
      return;
    }

    setIsLookingUp(true);
    setError(null);
    setLookupResults(null);

    try {
      // Parse input - support multiple hashes separated by comma or space
      const hashes = lookupInput
        .split(/[,\s]+/)
        .map(hash => hash.trim())
        .filter(hash => hash.length > 0)
        .map(hash => hash.startsWith('0x') ? hash : '0x' + hash);

      // Validate hashes
      for (const hash of hashes) {
        if (lookupType === 'function' && hash.length !== 10) {
          throw new Error(`Invalid function selector: ${hash} (must be 4 bytes / 10 characters with 0x)`);
        }
        if (lookupType === 'event' && hash.length !== 66) {
          throw new Error(`Invalid event topic: ${hash} (must be 32 bytes / 66 characters with 0x)`);
        }
      }

      let results: SignatureResponse;
      if (lookupType === 'function') {
        results = await lookupFunctionSignatures(hashes);
      } else {
        results = await lookupEventSignatures(hashes);
      }

      console.log('Lookup results:', results);
      setLookupResults(results);

      // Cache the results
      const resultsToCache = lookupType === 'function' ? results.result?.function : results.result?.event;
      if (resultsToCache) {
        Object.entries(resultsToCache).forEach(([hash, signatures]) => {
          if (signatures && signatures.length > 0) {
            cacheSignature(hash, signatures[0].name, lookupType);
          }
        });
      }

      loadCachedData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError('Please enter a search query');
      return;
    }

    setIsSearching(true);
    setError(null);
    setSearchResults(null);

    try {
      const results = await searchSignatures(searchQuery);
      setSearchResults(results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddCustomSignature = () => {
    if (!customSignature.trim()) {
      setError('Please enter a signature');
      return;
    }

    try {
      // Validate signature format
      if (customSignature.includes('(') && customSignature.includes(')')) {
        // Test if it can generate a hash
        const hash = ethers.utils.id(customSignature);
        console.log('Signature hash:', hash.slice(0, 10));
      } else {
        throw new Error('Invalid signature format. Expected: functionName(type1,type2,...)');
      }

      const newSignature: CustomSignature = {
        signature: customSignature.trim(),
        description: customDescription.trim() || undefined,
        project: customProject.trim() || undefined,
        timestamp: Date.now(),
      };

      saveCustomSignature(newSignature);
      setCustomSignatures(getCustomSignatures());
      
      // Clear form
      setCustomSignature('');
      setCustomDescription('');
      setCustomProject('');
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const generateSignatureHash = (signature: string, type: 'function' | 'event' = 'function') => {
    try {
      const hash = ethers.utils.id(signature);
      return type === 'function' ? hash.slice(0, 10) : hash;
    } catch {
      return 'Invalid signature';
    }
  };

  const extractSignaturesFromABI = () => {
    if (!abiInput.trim()) {
      setError('Please paste an ABI JSON');
      return;
    }

    setIsExtracting(true);
    setError(null);

    try {
      const abi = JSON.parse(abiInput);
      if (!Array.isArray(abi)) {
        throw new Error('ABI must be an array');
      }

      const functions: string[] = [];
      const events: string[] = [];

      abi.forEach((item: any) => {
        try {
          if (item.type === 'function' && item.name) {
            const inputs = item.inputs?.map((input: any) => input.type).join(',') || '';
            const signature = `${item.name}(${inputs})`;
            functions.push(signature);
          } else if (item.type === 'event' && item.name) {
            const inputs = item.inputs?.map((input: any) => input.type).join(',') || '';
            const signature = `${item.name}(${inputs})`;
            events.push(signature);
          }
        } catch (itemError) {
          console.warn('Failed to process ABI item:', item, itemError);
        }
      });

      setExtractedSignatures({ functions, events });
      setCustomProject(contractPath ? `Contract: ${contractPath}` : 'Imported ABI');
    } catch (err: any) {
      setError(`Failed to parse ABI: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const addExtractedSignatures = (signatures: string[], type: 'function' | 'event') => {
    signatures.forEach(signature => {
      const newSignature: CustomSignature = {
        signature,
        description: `${type === 'function' ? 'Function' : 'Event'} from imported ABI`,
        project: customProject || 'Imported ABI',
        timestamp: Date.now(),
      };
      saveCustomSignature(newSignature);
    });
    setCustomSignatures(getCustomSignatures());
    setError(null);
  };

  const addAllExtractedSignatures = () => {
    addExtractedSignatures(extractedSignatures.functions, 'function');
    addExtractedSignatures(extractedSignatures.events, 'event');
    setExtractedSignatures({functions: [], events: []});
    setAbiInput('');
    setContractPath('');
    setSelectedFiles([]);
    setParsedContracts({});
    setSelectedContracts([]);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const fileArray = Array.from(files);
    setSelectedFiles(fileArray);
    
    // Auto-process the selected files
    processSelectedFiles(fileArray);
  };

  const processSelectedFiles = async (filesToProcess: File[] = selectedFiles) => {
    if (filesToProcess.length === 0) return;

    setIsExtracting(true);
    setError(null);

    try {
      const contracts: {[contractName: string]: {abi: any[], functions: string[], events: string[], fileName: string}} = {};

      for (const file of filesToProcess) {
        try {
          // Skip non-JSON files
          if (!file.name.toLowerCase().endsWith('.json')) {
            console.log(`Skipping non-JSON file: ${file.name}`);
            continue;
          }

          const content = await file.text();
          let abi: any;
          let contractName: string;

          // Try to parse as JSON (ABI file or artifact file)
          try {
            const parsed = JSON.parse(content);
            // Check if it's a Hardhat/Foundry artifact file
            if (parsed.abi && Array.isArray(parsed.abi)) {
              abi = parsed.abi;
              contractName = parsed.contractName || file.name.replace('.json', '');
            } else if (Array.isArray(parsed)) {
              abi = parsed;
              contractName = file.name.replace('.json', '');
            } else {
              console.log(`Skipping file with invalid format: ${file.name}`);
              continue;
            }
          } catch {
            console.log(`Failed to parse ${file.name} as JSON, skipping`);
            continue;
          }

          // Extract signatures from ABI - only public/external functions
          const functions: string[] = [];
          const events: string[] = [];

          abi.forEach((item: any) => {
            try {
              if (item.type === 'function' && item.name) {
                // Only include public and external functions
                const visibility = item.stateMutability || item.visibility || 'public';
                const isPublicOrExternal = !visibility || visibility === 'public' || visibility === 'external' || 
                                         visibility === 'view' || visibility === 'pure' || visibility === 'payable' || visibility === 'nonpayable';
                
                if (isPublicOrExternal) {
                  const inputs = item.inputs?.map((input: any) => input.type).join(',') || '';
                  const signature = `${item.name}(${inputs})`;
                  functions.push(signature);
                }
              } else if (item.type === 'event' && item.name) {
                const inputs = item.inputs?.map((input: any) => input.type).join(',') || '';
                const signature = `${item.name}(${inputs})`;
                events.push(signature);
              }
            } catch (itemError) {
              console.warn(`Failed to process item in ${file.name}:`, item, itemError);
            }
          });

          // Only add contracts that have functions or events
          if (functions.length > 0 || events.length > 0) {
            contracts[contractName] = {
              abi,
              functions: Array.from(new Set(functions)), // Remove duplicates
              events: Array.from(new Set(events)),
              fileName: file.name
            };
          }
        } catch (fileError: any) {
          console.error(`Failed to process file ${file.name}:`, fileError);
          // Don't set error for individual files, just continue processing others
        }
      }

      setParsedContracts(contracts);
      setSelectedContracts(Object.keys(contracts)); // Select all by default
      setContractPath(`${Object.keys(contracts).length} contracts found`);
      
      // Update extracted signatures with all selected contracts
      updateExtractedSignaturesFromSelection(contracts, Object.keys(contracts));
      
    } catch (err: any) {
      setError(`Failed to process files: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const updateExtractedSignaturesFromSelection = (contracts: typeof parsedContracts, selectedContractNames: string[]) => {
    const allFunctions: string[] = [];
    const allEvents: string[] = [];

    selectedContractNames.forEach(contractName => {
      const contract = contracts[contractName];
      if (contract) {
        allFunctions.push(...contract.functions);
        allEvents.push(...contract.events);
      }
    });

    setExtractedSignatures({
      functions: Array.from(new Set(allFunctions)),
      events: Array.from(new Set(allEvents))
    });
  };

  const handleContractSelection = (contractName: string, isSelected: boolean) => {
    const newSelection = isSelected 
      ? [...selectedContracts, contractName]
      : selectedContracts.filter(name => name !== contractName);
    
    setSelectedContracts(newSelection);
    updateExtractedSignaturesFromSelection(parsedContracts, newSelection);
  };

  const selectAllContracts = () => {
    const allContracts = Object.keys(parsedContracts);
    setSelectedContracts(allContracts);
    updateExtractedSignaturesFromSelection(parsedContracts, allContracts);
  };

  const deselectAllContracts = () => {
    setSelectedContracts([]);
    setExtractedSignatures({functions: [], events: []});
  };

  const openFileModal = () => {
    setSelectedFiles([]);
    setParsedContracts({});
    setSelectedContracts([]);
    setShowFileModal(true);
  };

  const closeFileModal = () => {
    setShowFileModal(false);
    setSelectedFiles([]);
  };

  const clearCache = (type?: 'function' | 'event' | 'custom') => {
    clearSignatureCache(type);
    loadCachedData();
    setError(null);
  };

  return (
    <div className="signature-database">
      <h2 style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '24px',
        fontWeight: '700',
        color: '#1f2937',
        marginBottom: '8px'
      }}>
        <DatabaseIcon width={28} height={28} />
        Signature Database
      </h2>
      <p style={{ 
        fontSize: '15px', 
        color: '#6b7280', 
        marginBottom: '24px' 
      }}>
        Look up, search, and manage function & event signatures
      </p>

      <nav className="tabs">
        <button
          className={activeTab === 'lookup' ? 'active' : ''}
          onClick={() => setActiveTab('lookup')}
        >
          Lookup by Hash
        </button>
        <button
          className={activeTab === 'search' ? 'active' : ''}
          onClick={() => setActiveTab('search')}
        >
          Search by Name
        </button>
        <button
          className={activeTab === 'custom' ? 'active' : ''}
          onClick={() => setActiveTab('custom')}
        >
          Custom Signatures
        </button>
        <button
          className={activeTab === 'cache' ? 'active' : ''}
          onClick={() => setActiveTab('cache')}
        >
          Cached Results
        </button>
      </nav>

      <main className="content">
        {/* Lookup Tab */}
        {activeTab === 'lookup' && (
          <div className="panel">
            <h3 style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '16px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '16px'
            }}>
              <HashtagIcon width={18} height={18} />
              Lookup Signatures by Hash
            </h3>
            
            <div className="form-group">
              <label>Type</label>
              <select
                value={lookupType}
                onChange={(e) => setLookupType(e.target.value as 'function' | 'event')}
              >
                <option value="function">Function (4-byte selector)</option>
                <option value="event">Event (32-byte topic)</option>
              </select>
            </div>

            <div className="form-group">
              <label>
                {lookupType === 'function' ? 'Function Selector(s)' : 'Event Topic(s)'}
              </label>
              <input
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                placeholder={
                  lookupType === 'function'
                    ? '0xa9059cbb or a9059cbb (multiple separated by commas)'
                    : '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
                }
              />
              <small>
                {lookupType === 'function' 
                  ? 'Enter 4-byte function selectors (with or without 0x prefix)'
                  : 'Enter 32-byte event topic hashes'
                }
              </small>
            </div>

            <button onClick={handleLookup} disabled={isLookingUp}>
              {isLookingUp ? 'Looking up...' : 'Lookup Signatures'}
            </button>

            {lookupResults && lookupResults.result && (
              <div className="result">
                <h4>Results ({lookupResults.ok ? 'Success' : 'Failed'})</h4>
                {(() => {
                  const resultsData = lookupType === 'function' ? lookupResults.result.function : lookupResults.result.event;
                  if (!resultsData || Object.keys(resultsData).length === 0) {
                    return <div className="no-results">No results found</div>;
                  }
                  
                  return Object.entries(resultsData).map(([hash, signatures]) => (
                    <div key={hash} className="signature-result">
                      <div className="hash-header">
                        <strong>{hash}</strong>
                        <InlineCopyButton
                          value={hash}
                          ariaLabel="Copy hash"
                          iconSize={12}
                          size={28}
                        />
                      </div>
                      {signatures && signatures.length > 0 ? (
                        <div className="signatures-list">
                          {signatures.map((sig, index) => (
                            <div key={index} className="signature-item">
                              <code>{sig.name}</code>
                              <InlineCopyButton
                                value={sig.name}
                                ariaLabel="Copy signature"
                                iconSize={12}
                                size={28}
                              />
                              {sig.filtered && <span className="filtered-badge">Filtered</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="no-results">No signatures found</div>
                      )}
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        )}

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className="panel">
            <h3 style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '16px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '16px'
            }}>
              <SearchIcon width={18} height={18} />
              Search Signatures by Name
            </h3>
            
            <div className="form-group">
              <label>Search Query</label>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="transfer*, *ERC20*, balanceOf, Transfer(address,*"
              />
              <small>
                Use wildcards (*) to search. Examples: "transfer*", "*ERC20*", "approve"
              </small>
            </div>

            <button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Search Signatures'}
            </button>

            {searchResults && (
              <div className="result">
                <h4>Search Results ({searchResults.ok ? 'Success' : 'Failed'})</h4>
                
                {/* Function Results */}
                {searchResults.result?.function && Object.keys(searchResults.result.function).length > 0 && (
                  <div className="search-category">
                    <h5>Functions ({Object.keys(searchResults.result.function).length})</h5>
                    <div className="signatures-list">
                      {Object.entries(searchResults.result.function).map(([hash, signatures]) => 
                        signatures.map((sig, index) => (
                          <div key={`${hash}-${index}`} className="signature-item">
                            <div className="signature-content">
                              <code>{sig.name}</code>
                              <span className="hash">{hash}</span>
                            </div>
                            <div className="signature-actions">
                              <button
                                onClick={() => copyToClipboard(sig.name)}
                                className="copy-btn"
                                title="Copy signature"
                              >
                                <CopyIcon width={14} height={14} />
                              </button>
                              <button
                                onClick={() => copyToClipboard(hash)}
                                className="copy-btn"
                                title="Copy function hash"
                              >
                                <HashtagIcon width={14} height={14} />
                              </button>
                            </div>
                            {sig.filtered && <span className="filtered-badge">Filtered</span>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Event Results */}
                {searchResults.result?.event && Object.keys(searchResults.result.event).length > 0 && (
                  <div className="search-category">
                    <h5>Events ({Object.keys(searchResults.result.event).length})</h5>
                    <div className="signatures-list">
                      {Object.entries(searchResults.result.event).map(([hash, signatures]) => 
                        signatures.map((sig, index) => (
                          <div key={`${hash}-${index}`} className="signature-item">
                            <div className="signature-content">
                              <code>{sig.name}</code>
                              <span className="hash">{hash.slice(0, 10)}...{hash.slice(-8)}</span>
                            </div>
                            <div className="signature-actions">
                              <button
                                onClick={() => copyToClipboard(sig.name)}
                                className="copy-btn"
                                title="Copy signature"
                              >
                                <CopyIcon width={14} height={14} />
                              </button>
                              <button
                                onClick={() => copyToClipboard(hash)}
                                className="copy-btn"
                                title="Copy event hash"
                              >
                                <HashtagIcon width={14} height={14} />
                              </button>
                            </div>
                            {sig.filtered && <span className="filtered-badge">Filtered</span>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* No Results */}
                {(!searchResults.result?.function || Object.keys(searchResults.result.function).length === 0) &&
                 (!searchResults.result?.event || Object.keys(searchResults.result.event).length === 0) && (
                  <div className="no-results">No results found for "{searchQuery}"</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Custom Signatures Tab */}
        {activeTab === 'custom' && (
          <div className="panel">
            <h3 style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '16px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '16px'
            }}>
              <PlusIcon width={18} height={18} />
              Custom Signature Library
            </h3>
            
            {/* ABI Import Section */}
            <div className="abi-import-section">
              <h4 style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '12px'
              }}>
                <FileTextIcon width={16} height={16} />
                Import from ABI
              </h4>
              <p>Upload contract artifacts or paste ABI JSON to extract all function and event signatures.</p>
              
              <div className="form-group">
                <label>Contract Files</label>
                <div className="file-upload-container">
                  <button 
                    onClick={openFileModal}
                    className="file-upload-btn"
                    type="button"
                  >
                    Select Artifacts Folder
                  </button>
                  {contractPath && (
                    <div className="selected-files">
                      <small>Selected: {contractPath}</small>
                      <button 
                        onClick={() => {setContractPath(''); setSelectedFiles([]);}}
                        className="clear-files-btn"
                        type="button"
                      >
                        
                      </button>
                    </div>
                  )}
                </div>
                <small>Select your artifacts/ or out/ folder to scan all contract JSON files</small>
              </div>

              <div className="form-group">
                <label>ABI JSON</label>
                <textarea
                  value={abiInput}
                  onChange={(e) => setAbiInput(e.target.value)}
                  placeholder='[{"inputs":[],"name":"transfer","outputs":[],"stateMutability":"nonpayable","type":"function"}, ...]'
                  rows={6}
                  style={{ fontFamily: 'monospace', fontSize: '12px' }}
                />
                <small>Paste the complete ABI JSON array</small>
              </div>

              <button 
                onClick={extractSignaturesFromABI} 
                disabled={isExtracting}
                className="extract-btn"
              >
                {isExtracting ? 'Extracting...' : 'Extract Signatures'}
              </button>

              {/* Extracted Signatures Preview */}
              {(extractedSignatures.functions.length > 0 || extractedSignatures.events.length > 0) && (
                <div className="extracted-preview">
                  <h5>Extracted Signatures</h5>
                  
                  {extractedSignatures.functions.length > 0 && (
                    <div className="signature-category">
                      <h6>Functions ({extractedSignatures.functions.length})</h6>
                      <div className="signature-preview-list">
                        {extractedSignatures.functions.slice(0, 5).map((sig, index) => (
                          <div key={index} className="signature-preview">
                            <code>{sig}</code>
                            <span className="hash-preview">{generateSignatureHash(sig)}</span>
                          </div>
                        ))}
                        {extractedSignatures.functions.length > 5 && (
                          <div className="more-signatures">
                            +{extractedSignatures.functions.length - 5} more functions...
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {extractedSignatures.events.length > 0 && (
                    <div className="signature-category">
                      <h6>Events ({extractedSignatures.events.length})</h6>
                      <div className="signature-preview-list">
                        {extractedSignatures.events.slice(0, 5).map((sig, index) => (
                          <div key={index} className="signature-preview">
                            <code>{sig}</code>
                            <span className="hash-preview">{generateSignatureHash(sig, 'event').slice(0, 10)}...</span>
                          </div>
                        ))}
                        {extractedSignatures.events.length > 5 && (
                          <div className="more-signatures">
                            +{extractedSignatures.events.length - 5} more events...
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="extracted-actions">
                    <button 
                      onClick={addAllExtractedSignatures}
                      className="add-all-btn"
                    >
                       Add All ({extractedSignatures.functions.length + extractedSignatures.events.length}) Signatures
                    </button>
                    <button 
                      onClick={() => addExtractedSignatures(extractedSignatures.functions, 'function')}
                      disabled={extractedSignatures.functions.length === 0}
                      className="add-functions-btn"
                    >
                       Add Functions ({extractedSignatures.functions.length})
                    </button>
                    <button 
                      onClick={() => addExtractedSignatures(extractedSignatures.events, 'event')}
                      disabled={extractedSignatures.events.length === 0}
                      className="add-events-btn"
                    >
                       Add Events ({extractedSignatures.events.length})
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Manual Signature Entry */}
            <div className="manual-signature-section">
              <h4>Add Individual Signature</h4>
              
              <div className="form-group">
                <label>Signature</label>
                <input
                  value={customSignature}
                  onChange={(e) => setCustomSignature(e.target.value)}
                  placeholder="transfer(address,uint256)"
                />
              </div>

              <div className="form-group">
                <label>Description (optional)</label>
                <input
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  placeholder="Transfer tokens to address"
                />
              </div>

              <div className="form-group">
                <label>Project (optional)</label>
                <input
                  value={customProject}
                  onChange={(e) => setCustomProject(e.target.value)}
                  placeholder="ERC20, Uniswap, etc."
                />
              </div>

              <button onClick={handleAddCustomSignature}>
                 Add Custom Signature
              </button>
            </div>

            {customSignatures.length > 0 && (
              <details className="cache-dropdown" open>
                <summary className="cache-summary" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'var(--bg-glass)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                  marginBottom: '16px',
                  listStyle: 'none'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <PlusIcon width={16} height={16} />
                    Custom Signatures ({customSignatures.length})
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        clearCache('custom');
                      }}
                      className="clear-btn-small"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-tertiary)',
                        cursor: 'pointer',
                        fontSize: '12px',
                        padding: '4px 8px'
                      }}
                      title="Clear all custom signatures"
                    >
                      <TrashIcon width={12} height={12} />
                    </button>
                  </div>
                </summary>
                
                <div className="signatures-list" style={{ marginLeft: '8px' }}>
                  {customSignatures.map((sig, index) => (
                    <div key={index} 
                         className="signature-item cached" 
                         style={{ 
                           fontSize: '13px', 
                           padding: '6px 12px',
                           display: 'flex',
                           alignItems: 'center',
                           justifyContent: 'space-between',
                           borderBottom: '1px solid var(--border-secondary)',
                           background: 'rgba(26, 26, 26, 0.3)'
                         }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1', minWidth: '0' }}>
                        <code style={{ 
                          fontFamily: 'var(--font-mono)', 
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: '1'
                        }}>{sig.signature}</code>
                        <span style={{ 
                          fontSize: '11px', 
                          color: 'var(--text-tertiary)',
                          fontFamily: 'var(--font-mono)',
                          flexShrink: '0'
                        }}>
                          {sig.project || new Date(sig.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(sig.signature)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: '4px',
                          color: 'var(--text-tertiary)',
                          flexShrink: '0'
                        }}
                        title="Copy signature"
                      >
                        
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Cache Tab */}
        {activeTab === 'cache' && (
          <div className="panel">
            <h3 style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '16px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '16px'
            }}>
              <DatabaseIcon width={18} height={18} />
              Cached Signatures
            </h3>
            
            {Object.keys(cachedFunctions).length > 0 && (
              <details className="cache-dropdown" open>
                <summary className="cache-summary" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'var(--bg-glass)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                  marginBottom: '16px',
                  listStyle: 'none'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <HashtagIcon width={16} height={16} />
                    Functions ({Object.keys(cachedFunctions).length})
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        clearCache('function');
                      }}
                      className="clear-btn-small"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-tertiary)',
                        cursor: 'pointer',
                        fontSize: '12px',
                        padding: '4px 8px'
                      }}
                      title="Clear all function signatures"
                    >
                      <TrashIcon width={12} height={12} />
                    </button>
                  </div>
                </summary>
                
                <div className="signatures-list" style={{ marginLeft: '8px' }}>
                  {Object.values(cachedFunctions).map((sig: any) => (
                    <div key={sig.hash} 
                         className="signature-item cached" 
                         style={{ 
                           fontSize: '13px', 
                           padding: '6px 12px',
                           display: 'flex',
                           alignItems: 'center',
                           justifyContent: 'space-between',
                           borderBottom: '1px solid var(--border-secondary)',
                           background: 'rgba(26, 26, 26, 0.3)'
                         }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1', minWidth: '0' }}>
                        <code style={{ 
                          fontFamily: 'var(--font-mono)', 
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: '1'
                        }}>{sig.name}</code>
                        <span style={{ 
                          fontSize: '11px', 
                          color: 'var(--text-tertiary)',
                          fontFamily: 'var(--font-mono)',
                          flexShrink: '0'
                        }}>
                          {new Date(sig.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(sig.name)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: '4px',
                          color: 'var(--text-tertiary)',
                          flexShrink: '0'
                        }}
                        title="Copy signature"
                      >
                        
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {Object.keys(cachedEvents).length > 0 && (
              <details className="cache-dropdown" open>
                <summary className="cache-summary" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'var(--bg-glass)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                  marginBottom: '16px',
                  listStyle: 'none'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileTextIcon width={16} height={16} />
                    Events ({Object.keys(cachedEvents).length})
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        clearCache('event');
                      }}
                      className="clear-btn-small"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-tertiary)',
                        cursor: 'pointer',
                        fontSize: '12px',
                        padding: '4px 8px'
                      }}
                      title="Clear all event signatures"
                    >
                      <TrashIcon width={12} height={12} />
                    </button>
                  </div>
                </summary>
                
                <div className="signatures-list" style={{ marginLeft: '8px' }}>
                  {Object.values(cachedEvents).map((sig: any) => (
                    <div key={sig.hash} 
                         className="signature-item cached" 
                         style={{ 
                           fontSize: '13px', 
                           padding: '6px 12px',
                           display: 'flex',
                           alignItems: 'center',
                           justifyContent: 'space-between',
                           borderBottom: '1px solid var(--border-secondary)',
                           background: 'rgba(26, 26, 26, 0.3)'
                         }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1', minWidth: '0' }}>
                        <code style={{ 
                          fontFamily: 'var(--font-mono)', 
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: '1'
                        }}>{sig.name}</code>
                        <span style={{ 
                          fontSize: '11px', 
                          color: 'var(--text-tertiary)',
                          fontFamily: 'var(--font-mono)',
                          flexShrink: '0'
                        }}>
                          {new Date(sig.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(sig.name)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: '4px',
                          color: 'var(--text-tertiary)',
                          flexShrink: '0'
                        }}
                        title="Copy signature"
                      >
                        
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="cache-actions">
              <button
                onClick={() => clearCache()}
                className="clear-all-btn"
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <TrashIcon width={14} height={14} />
                  <span>Clear All Cache</span>
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="error-message">
             {error}
          </div>
        )}
      </main>

      {/* File Upload Modal */}
      {showFileModal && (
        <div className="modal-overlay" onClick={closeFileModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '16px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '16px'
              }}>
                <Upload size={18} />
                Upload Contract Files
              </h3>
              <button onClick={closeFileModal} className="modal-close">
                
              </button>
            </div>
            <div className="modal-body">
              <p>Select your artifacts folder (artifacts/ or out/) to scan all contract JSON files:</p>
              
              <div className="file-input-container">
                <input
                  type="file"
                  id="contract-files"
                  multiple
                  accept=".json,.abi"
                  onChange={handleFileSelect}
                  className="file-input"
                  {...({ webkitdirectory: "" } as any)}
                />
                <label htmlFor="contract-files" className="file-input-label">
                   Select Folder
                </label>
              </div>
              
              {Object.keys(parsedContracts).length > 0 && (
                <div className="contracts-selection">
                  <div className="contracts-header">
                    <h4>Found Contracts ({Object.keys(parsedContracts).length}):</h4>
                    <div className="selection-controls">
                      <button onClick={selectAllContracts} className="select-all-btn">
                         All
                      </button>
                      <button onClick={deselectAllContracts} className="deselect-all-btn">
                         None
                      </button>
                    </div>
                  </div>
                  <div className="contracts-list">
                    {Object.entries(parsedContracts).map(([contractName, contractData]) => (
                      <div key={contractName} className="contract-item">
                        <label className="contract-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedContracts.includes(contractName)}
                            onChange={(e) => handleContractSelection(contractName, e.target.checked)}
                          />
                          <div className="contract-info">
                            <span className="contract-name">{contractName}</span>
                            <div className="contract-stats">
                              <span className="functions-count">{contractData.functions.length} functions</span>
                              <span className="events-count">{contractData.events.length} events</span>
                              <span className="file-name">({contractData.fileName})</span>
                            </div>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedFiles.length > 0 && Object.keys(parsedContracts).length === 0 && (
                <div className="selected-files-list">
                  <h4>Processing Files ({selectedFiles.length}):</h4>
                  <ul>
                    {selectedFiles.map((file, index) => (
                      <li key={index} className="selected-file">
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">({(file.size / 1024).toFixed(1)} KB)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="file-types-info">
                <h4>Supported File Types:</h4>
                <ul>
                  <li><strong>ABI Files:</strong> Pure ABI JSON arrays (.json, .abi)</li>
                  <li><strong>Hardhat Artifacts:</strong> Files from artifacts/ directory</li>
                  <li><strong>Foundry Artifacts:</strong> Files from out/ directory</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={closeFileModal} className="btn-secondary">
                Cancel
              </button>
              {Object.keys(parsedContracts).length > 0 && (
                <button 
                  onClick={() => setShowFileModal(false)}
                  className="btn-primary"
                >
                  Use Selected Contracts ({selectedContracts.length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SignatureDatabase;
