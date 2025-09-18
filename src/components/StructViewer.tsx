import React, { useState } from 'react';
import { ethers } from 'ethers';
import { ChevronDownIcon, ChevronRightIcon } from './icons/IconLibrary';

interface StructField {
  name: string;
  type: string;
  value: any;
  isArray?: boolean;
  arrayLength?: number;
}

interface StructViewerProps {
  data: StructField[];
  title?: string;
  level?: number;
  maxItemsPreview?: number;
  className?: string;
}

const StructViewer: React.FC<StructViewerProps> = ({
  data,
  title = 'Struct',
  level = 0,
  maxItemsPreview = 3,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand top 2 levels
  const [showAll, setShowAll] = useState(false);

  const shouldShowPreview = data.length > maxItemsPreview && !showAll;
  const displayData = shouldShowPreview ? data.slice(0, maxItemsPreview) : data;
  const hiddenCount = data.length - maxItemsPreview;

  const decodeHexString = (value: string): string | null => {
    try {
      if (typeof value === 'string' && value.startsWith('0x') && value.length > 10) {
        // Try to decode as UTF-8 text
        const hex = value.slice(2);
        if (hex.length % 2 === 0) {
          const bytes = hex.match(/.{1,2}/g);
          if (bytes) {
            const decoded = bytes
              .map(byte => String.fromCharCode(parseInt(byte, 16)))
              .join('')
              .replace(/\0/g, ''); // Remove null bytes
            
            // Only return if it looks like readable text
            if (/^[a-zA-Z0-9\s\-_.,!@#$%^&*()]+$/.test(decoded) && decoded.length > 2) {
              return decoded;
            }
          }
        }
      }
    } catch (error) {
      // Not decodeable, return null
    }
    return null;
  };

  const formatValue = (field: StructField): React.ReactNode => {
    const { value, type, isArray } = field;

    // Handle arrays
    if (isArray && Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="empty-array">[] (empty)</span>;
      }
      
      if (value.length <= 3) {
        return (
          <div className="array-inline">
            [{value.map((item, idx) => (
              <span key={idx} className="array-item">
                {formatSingleValue(item, type.replace('[]', ''))}
                {idx < value.length - 1 && ', '}
              </span>
            ))}]
          </div>
        );
      } else {
        return (
          <ArrayViewer 
            values={value} 
            type={type.replace('[]', '')} 
            maxPreview={2}
          />
        );
      }
    }

    return formatSingleValue(value, type);
  };

  const formatSingleValue = (value: any, type: string): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="null-value">null</span>;
    }

    // Try hex string decoding first
    const decodedText = decodeHexString(value);
    if (decodedText) {
      return (
        <div className="hex-decoded">
          <div className="decoded-text">"{decodedText}"</div>
          <div className="original-hex" title={value}>
            {value.length > 20 ? `${value.slice(0, 20)}...` : value}
          </div>
        </div>
      );
    }

    // Handle different types
    switch (true) {
      case type === 'address':
        return (
          <div className="address-value">
            <span className="address-text">{value}</span>
            <button 
              className="copy-btn" 
              onClick={() => navigator.clipboard.writeText(value)}
              title="Copy address"
            >
              📋
            </button>
          </div>
        );

      case type.includes('uint') || type.includes('int'):
        try {
          const bn = ethers.BigNumber.from(value);
          const stringValue = bn.toString();
          
          // Check if it might be a timestamp
          if (bn.gte(1000000000) && bn.lt(Date.now() / 1000 + 86400 * 365)) {
            const date = new Date(parseInt(stringValue) * 1000);
            return (
              <div className="timestamp-value">
                <div className="timestamp-date">{date.toLocaleString()}</div>
                <div className="timestamp-number">{stringValue}</div>
              </div>
            );
          }
          
          // Format large numbers
          if (bn.gt(ethers.BigNumber.from(10).pow(15))) {
            return (
              <div className="big-number">
                <div className="number-formatted">{formatLargeNumber(stringValue)}</div>
                <div className="number-raw">{stringValue}</div>
              </div>
            );
          }
          
          return <span className="number-value">{stringValue}</span>;
        } catch (error) {
          return <span className="invalid-number">{String(value)}</span>;
        }

      case type === 'bool':
        return (
          <span className={`bool-value ${value ? 'bool-true' : 'bool-false'}`}>
            {value ? 'true' : 'false'}
          </span>
        );

      case type.includes('bytes'):
        const str = String(value);
        if (str.length > 42) {
          return (
            <div className="bytes-value">
              <div className="bytes-preview">{str.slice(0, 42)}...</div>
              <div className="bytes-info">({(str.length - 2) / 2} bytes)</div>
            </div>
          );
        }
        return <span className="bytes-value">{str}</span>;

      default:
        return <span className="generic-value">{String(value)}</span>;
    }
  };

  const formatLargeNumber = (numStr: string): string => {
    if (numStr.length > 18) {
      // Might be wei, try to format as ETH
      try {
        const eth = ethers.utils.formatEther(numStr);
        return `${eth} ETH`;
      } catch {
        // Not wei, just format with commas
        return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }
    }
    return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const getFieldIcon = (type: string): string => {
    if (type === 'address') return '📍';
    if (type === 'bool') return '🔘';
    if (type.includes('uint') || type.includes('int')) return '🔢';
    if (type.includes('bytes')) return '📄';
    if (type.includes('[]')) return '📋';
    return '⚪';
  };

  return (
    <div className={`struct-viewer level-${level} ${className}`}>
      <div className="struct-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="struct-toggle">
          <span className="toggle-icon">{isExpanded ? <ChevronDownIcon width={12} height={12} /> : <ChevronRightIcon width={12} height={12} />}</span>
          <span className="struct-title">{title}</span>
          <span className="field-count">({data.length} fields)</span>
        </div>
        {!isExpanded && (
          <div className="struct-preview">
            {data.slice(0, 2).map((field, idx) => (
              <span key={idx} className="preview-field">
                {field.name}: {String(field.value).slice(0, 10)}...
                {idx === 0 && data.length > 1 && ', '}
              </span>
            ))}
            {data.length > 2 && '...'}
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="struct-content">
          {displayData.map((field, index) => (
            <div key={index} className="struct-field">
              <div className="field-header">
                <span className="field-icon">{getFieldIcon(field.type)}</span>
                <span className="field-name">{field.name}</span>
                <span className="field-type">({field.type})</span>
                {field.isArray && field.arrayLength !== undefined && (
                  <span className="array-length">[{field.arrayLength}]</span>
                )}
              </div>
              <div className="field-value">
                {formatValue(field)}
              </div>
            </div>
          ))}
          
          {shouldShowPreview && (
            <div className="show-more-section">
              <button 
                className="show-more-btn"
                onClick={() => setShowAll(true)}
              >
                ▼ Show {hiddenCount} more fields
              </button>
            </div>
          )}
          
          {showAll && data.length > maxItemsPreview && (
            <div className="show-less-section">
              <button 
                className="show-less-btn"
                onClick={() => setShowAll(false)}
              >
                ▲ Show less
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Helper component for array visualization
const ArrayViewer: React.FC<{
  values: any[];
  type: string;
  maxPreview: number;
}> = ({ values, type, maxPreview }) => {
  const [showAll, setShowAll] = useState(false);
  const displayValues = showAll ? values : values.slice(0, maxPreview);
  
  return (
    <div className="array-viewer">
      <div className="array-header">
        <span>Array[{values.length}]:</span>
      </div>
      <div className="array-items">
        {displayValues.map((value, idx) => (
          <div key={idx} className="array-item-row">
            <span className="array-index">[{idx}]</span>
            <span className="array-value">
              {type === 'address' && typeof value === 'string' ? 
                value : String(value).slice(0, 30) + (String(value).length > 30 ? '...' : '')
              }
            </span>
          </div>
        ))}
      </div>
      {values.length > maxPreview && (
        <button 
          className="array-toggle-btn"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 
            `▲ Show less` : 
            `▼ Show ${values.length - maxPreview} more items`
          }
        </button>
      )}
    </div>
  );
};

export default StructViewer;