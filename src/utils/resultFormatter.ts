import { ethers } from 'ethers';

export interface FormattedResult {
  displayValue: string;
  htmlContent: string;
  type: string;
  isComplex: boolean;
}

export class ContractResultFormatter {
  private static formatBigNumber(value: any): string {
    if (ethers.BigNumber.isBigNumber(value)) {
      const str = value.toString();
      // Format large numbers with commas for readability
      if (str.length > 6) {
        return str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }
      return str;
    }
    return value.toString();
  }

  private static formatAddress(value: string): string {
    if (typeof value === 'string' && value.match(/^0x[a-fA-F0-9]{40}$/)) {
      return `${value.slice(0, 6)}...${value.slice(-4)}`;
    }
    return value;
  }

  private static formatBytes(value: string): string {
    if (typeof value === 'string' && value.startsWith('0x')) {
      if (value.length > 10) {
        return `${value.slice(0, 10)}...${value.slice(-4)} (${(value.length - 2) / 2} bytes)`;
      }
    }
    return value;
  }

  private static getValueType(value: any): string {
    if (ethers.BigNumber.isBigNumber(value)) return 'uint';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object' && value !== null) return 'tuple';
    if (typeof value === 'string' && value.match(/^0x[a-fA-F0-9]{40}$/)) return 'address';
    if (typeof value === 'string' && value.startsWith('0x')) return 'bytes';
    if (typeof value === 'boolean') return 'bool';
    if (typeof value === 'string') return 'string';
    return 'unknown';
  }

  private static formatTuple(
    value: any, 
    functionOutput?: any, 
    depth: number = 0,
    forceExpanded: boolean = false
  ): { html: string; text: string } {
    const isCompact = depth === 0 && !forceExpanded; // Make root level compact unless forced expanded
    
    if (isCompact) {
      // Line-per-field format for better readability
      let lines: string[] = [];
      
      // Handle named tuple fields if we have function output info
      if (functionOutput && functionOutput.components && functionOutput.components.length > 0) {
        console.log(`🎯 [FormatTuple] COMPACT NAMED TUPLE: ${functionOutput.components.length} components, forceExpanded: ${forceExpanded}`);
        console.log(`🎯 [FormatTuple] Components:`, functionOutput.components);
        console.log(`🎯 [FormatTuple] Value:`, value);
        
        functionOutput.components.forEach((component: any, index: number) => {
          const fieldName = component.name || `field_${index}`;
          let fieldValue;
          if (Array.isArray(value)) {
            fieldValue = value[fieldName] !== undefined ? value[fieldName] : value[index];
          } else {
            fieldValue = value[fieldName];
          }
          
          console.log(`🎯 [FormatTuple] Field ${fieldName}[${index}]:`, fieldValue);
          console.log(`🎯 [FormatTuple] Component structure for ${fieldName}:`, component);
          
          // For arrays within tuples, use expanded formatting to show structure
          if (Array.isArray(fieldValue) && component.components) {
            console.log(`🎯 [FormatTuple] ${fieldName} is array of tuples, using expanded format`);
            const arrayStructure = {
              type: 'tuple[]',
              arrayChildren: {
                type: 'tuple',
                components: component.components
              }
            };
            const formatted = this.formatArray(fieldValue, arrayStructure, depth + 1);
            const styledLine = `<span class="field-name">${fieldName}</span>: ${formatted.html}`;
            lines.push(styledLine);
          } else {
            const formattedResult = this.formatValueForCleanWithTooltip(fieldValue);
            // Create styled line
            const styledLine = this.applyColorStyledWithTooltip(`${fieldName}: ${formattedResult.display}`, fieldName, formattedResult.tooltip);
            lines.push(styledLine);
          }
        });
      } else {
        // Handle unnamed tuple or object
        if (Array.isArray(value)) {
          value.forEach((item, index) => {
            const formattedResult = this.formatValueForCleanWithTooltip(item);
            const styledLine = this.applyColorStyledWithTooltip(`[${index}]: ${formattedResult.display}`, `[${index}]`, formattedResult.tooltip);
            lines.push(styledLine);
          });
        } else {
          Object.entries(value).forEach(([key, val]) => {
            const formattedResult = this.formatValueForCleanWithTooltip(val);
            const styledLine = this.applyColorStyledWithTooltip(`${key}: ${formattedResult.display}`, key, formattedResult.tooltip);
            lines.push(styledLine);
          });
        }
      }
      
      // Join with newlines for line-per-field display
      const compactText = lines.join('\n');
      const compactHtml = `<div class="tuple-container-lines">
        ${lines.map(line => `<div class="tuple-line">${line}</div>`).join('')}
      </div>`;
      
      return { html: compactHtml, text: compactText };
    } else {
      // Fallback to expanded format for nested structures
      const indent = '  '.repeat(depth);
      const nextIndent = '  '.repeat(depth + 1);
      
      let html = '<div class="tuple-container">';
      let text = '{\n';

      // Handle named tuple fields if we have function output info
      if (functionOutput && functionOutput.components && functionOutput.components.length > 0) {
        console.log(`🎯 [FormatTuple] EXPANDED NAMED TUPLE: ${functionOutput.components.length} components`);
        console.log(`🎯 [FormatTuple] Components:`, functionOutput.components);
        console.log(`🎯 [FormatTuple] Value:`, value);
        
        functionOutput.components.forEach((component: any, index: number) => {
          const fieldName = component.name || `field_${index}`;
          let fieldValue;
          if (Array.isArray(value)) {
            fieldValue = value[fieldName] !== undefined ? value[fieldName] : value[index];
          } else {
            fieldValue = value[fieldName];
          }
          const fieldType = component.type;
          
          console.log(`🎯 [FormatTuple] EXPANDED Field ${fieldName}[${index}] (${fieldType}):`, fieldValue);
          console.log(`🎯 [FormatTuple] Component structure for ${fieldName}:`, component);
          
          const formatted = this.formatValue(fieldValue, component, depth + 1);
          
          html += `
            <div class="tuple-field">
              <span class="field-name">${fieldName}</span>
              <span class="field-type">(${fieldType})</span>
              <span class="field-separator">:</span>
              <span class="field-value">${formatted.html}</span>
            </div>
          `;
          
          text += `${nextIndent}${fieldName} (${fieldType}): ${formatted.text}\n`;
        });
      } else {
        // Handle unnamed tuple or object
        if (Array.isArray(value)) {
          value.forEach((item, index) => {
            const formatted = this.formatValue(item, null, depth + 1);
            html += `
              <div class="tuple-field">
                <span class="field-name">[${index}]</span>
                <span class="field-separator">:</span>
                <span class="field-value">${formatted.html}</span>
              </div>
            `;
            text += `${nextIndent}[${index}]: ${formatted.text}\n`;
          });
        } else {
          Object.entries(value).forEach(([key, val]) => {
            const formatted = this.formatValue(val, null, depth + 1);
            html += `
              <div class="tuple-field">
                <span class="field-name">${key}</span>
                <span class="field-separator">:</span>
                <span class="field-value">${formatted.html}</span>
              </div>
            `;
            text += `${nextIndent}${key}: ${formatted.text}\n`;
          });
        }
      }

      html += '</div>';
      text += `${indent}}`;
      
      return { html, text };
    }
  }

  private static applyColorStyling(line: string, fieldName: string): string {
    // Apply field name color
    const styledFieldName = `<span class="field-name">${fieldName}</span>`;
    line = line.replace(fieldName, styledFieldName);
    
    // Apply colors to values based on patterns
    // Address pattern
    line = line.replace(/(0x[a-fA-F0-9]{40})/g, '<span class="address-value">$1</span>');
    
    // Array pattern - use word-wrap friendly styling
    line = line.replace(/(\[[^\]]+\])/g, '<span class="array-value word-wrap-array">$1</span>');
    
    // Number patterns (but not in addresses or arrays)
    line = line.replace(/(?<![\w\[])\b(\d+)\b(?![\w\]])/g, '<span class="number-value">$1</span>');
    
    // Boolean values
    line = line.replace(/\b(true|false)\b/g, '<span class="bool-value $1">$1</span>');
    
    // Hex values (non-address)
    line = line.replace(/(?<!0x[a-fA-F0-9]*)(0x[a-fA-F0-9]{1,39}|0x[a-fA-F0-9]{41,})/g, '<span class="bytes-value">$1</span>');
    
    return line;
  }

  private static formatValueForCleanWithTooltip(value: any): { display: string; tooltip: string | null } {
    if (ethers.BigNumber.isBigNumber(value)) {
      const formatted = this.formatBigNumber(value);
      return { display: formatted, tooltip: null };
    }
    if (typeof value === 'string' && value.match(/^0x[a-fA-F0-9]{40}$/)) {
      return { display: value, tooltip: null };
    }
    if (typeof value === 'string' && value.startsWith('0x')) {
      return { display: value, tooltip: null };
    }
    if (Array.isArray(value)) {
      // Check if we have structured data (arrays of tuples/objects)
      const hasStructuredData = value.length > 0 && 
        (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0]));
      
      if (hasStructuredData) {
        // For arrays of objects/tuples, format as JSON-like structure
        const formattedItems = value.map((item, index) => {
          if (typeof item === 'object' && item !== null) {
            // Format as object with key-value pairs
            const pairs = Object.entries(item).map(([key, val]) => {
              let formattedVal;
              if (typeof val === 'string' && val.match(/^0x[a-fA-F0-9]{40}$/)) {
                formattedVal = val;
              } else if (typeof val === 'string' && val.startsWith('0x')) {
                formattedVal = val;
              } else if (ethers.BigNumber.isBigNumber(val)) {
                formattedVal = this.formatBigNumber(val);
              } else if (Array.isArray(val)) {
                formattedVal = `[${val.join(', ')}]`;
              } else if (typeof val === 'object' && val !== null) {
                // Nested object - format recursively
                const nestedPairs = Object.entries(val).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`);
                formattedVal = `{${nestedPairs.join(', ')}}`;
              } else {
                formattedVal = typeof val === 'string' ? `"${val}"` : String(val);
              }
              return `"${key}": ${formattedVal}`;
            });
            return `{${pairs.join(', ')}}`;
          }
          return String(item);
        });
        
        const fullArray = `[${formattedItems.join(', ')}]`;
        return { display: fullArray, tooltip: null };
      } else {
        // Simple array of primitives
        const formattedItems = value.map(v => {
          if (typeof v === 'string' && v.match(/^0x[a-fA-F0-9]{40}$/)) {
            return v;
          }
          if (typeof v === 'string' && v.startsWith('0x')) {
            return v;
          }
          if (ethers.BigNumber.isBigNumber(v)) {
            return this.formatBigNumber(v);
          }
          return String(v);
        });
        
        // For arrays, use word-wrap friendly format with proper element demarcation
        // Format: [item1, item2, item3, ...] with natural word wrapping
        const arrayContent = formattedItems.join(', ');
        const fullArray = `[${arrayContent}]`;
        
        return { display: fullArray, tooltip: null };
      }
    }
    if (typeof value === 'boolean') {
      return { display: String(value), tooltip: null };
    }
    if (typeof value === 'string') {
      const display = value === '' ? '' : value;
      return { display, tooltip: null };
    }
    return { display: String(value), tooltip: null };
  }

  private static applyColorStyledWithTooltip(line: string, fieldName: string, tooltip: string | null): string {
    // Apply field name color
    const styledFieldName = `<span class="field-name">${fieldName}</span>`;
    line = line.replace(fieldName, styledFieldName);
    
    // Apply colors to values based on patterns
    // Address pattern
    line = line.replace(/(0x[a-fA-F0-9]{40})/g, '<span class="address-value">$1</span>');
    
    // Array pattern - use word-wrap friendly styling
    line = line.replace(/(\[[^\]]+\])/g, '<span class="array-value word-wrap-array">$1</span>');
    
    // Number patterns (but not in addresses or arrays)
    line = line.replace(/(?<![\w\[])\b(\d+)\b(?![\w\]])/g, '<span class="number-value">$1</span>');
    
    // Boolean values
    line = line.replace(/\b(true|false)\b/g, '<span class="bool-value $1">$1</span>');
    
    // Hex values (non-address)
    line = line.replace(/(?<!0x[a-fA-F0-9]*)(0x[a-fA-F0-9]{1,39}|0x[a-fA-F0-9]{41,})/g, '<span class="bytes-value">$1</span>');
    
    return line;
  }

  private static formatValueForClean(value: any): string {
    if (ethers.BigNumber.isBigNumber(value)) {
      return this.formatBigNumber(value);
    }
    if (typeof value === 'string' && value.match(/^0x[a-fA-F0-9]{40}$/)) {
      return value;
    }
    if (typeof value === 'string' && value.startsWith('0x')) {
      return value;
    }
    if (Array.isArray(value)) {
      const formattedItems = value.map(v => {
        if (typeof v === 'string' && v.match(/^0x[a-fA-F0-9]{40}$/)) {
          return v;
        }
        if (typeof v === 'string' && v.startsWith('0x')) {
          return v;
        }
        if (ethers.BigNumber.isBigNumber(v)) {
          return this.formatBigNumber(v);
        }
        return String(v);
      });
      
      // Show full array with word-wrap friendly format
      const arrayContent = formattedItems.join(', ');
      return `[${arrayContent}]`;
    }
    if (typeof value === 'boolean') {
      return String(value);
    }
    if (typeof value === 'string') {
      return value === '' ? '' : value; // Handle empty strings properly
    }
    return String(value);
  }

  private static formatValueForJson(value: any): string {
    if (ethers.BigNumber.isBigNumber(value)) {
      return `<span class="number-value">"${this.formatBigNumber(value)}"</span>`;
    }
    if (typeof value === 'string' && value.match(/^0x[a-fA-F0-9]{40}$/)) {
      return `<span class="address-value">"${value}"</span>`;
    }
    if (typeof value === 'string' && value.startsWith('0x')) {
      return `<span class="bytes-value">"${value}"</span>`;
    }
    if (Array.isArray(value)) {
      // Show all array values inline with proper colors
      const formattedItems = value.map(v => {
        if (typeof v === 'string' && v.match(/^0x[a-fA-F0-9]{40}$/)) {
          return `<span class="address-value">${v}</span>`;
        }
        if (typeof v === 'string' && v.startsWith('0x')) {
          return `<span class="bytes-value">${v}</span>`;
        }
        if (ethers.BigNumber.isBigNumber(v)) {
          return `<span class="number-value">${this.formatBigNumber(v)}</span>`;
        }
        if (typeof v === 'boolean') {
          return `<span class="bool-value ${v}">${v}</span>`;
        }
        if (typeof v === 'string') {
          return `<span class="string-value">${v}</span>`;
        }
        return `<span class="number-value">${v}</span>`;
      });
      return `<span class="array-bracket">[</span>${formattedItems.join('<span class="array-separator">, </span>')}<span class="array-bracket">]</span>`;
    }
    if (typeof value === 'boolean') {
      return `<span class="bool-value ${value}">${value}</span>`;
    }
    if (typeof value === 'string') {
      return `<span class="string-value">"${value}"</span>`;
    }
    return `<span class="number-value">${value}</span>`;
  }

  private static formatSimpleValue(value: any): string {
    if (ethers.BigNumber.isBigNumber(value)) {
      return `"${this.formatBigNumber(value)}"`;
    }
    if (typeof value === 'string' && value.match(/^0x[a-fA-F0-9]{40}$/)) {
      return `"${value}"`;
    }
    if (typeof value === 'string' && value.startsWith('0x')) {
      return `"${value}"`;
    }
    if (Array.isArray(value)) {
      // Show all array values inline
      return `[${value.map(v => {
        if (typeof v === 'string') return v;
        return String(v);
      }).join(', ')}]`;
    }
    if (typeof value === 'boolean') {
      return String(value);
    }
    if (typeof value === 'string') {
      return `"${value}"`;
    }
    return String(value);
  }

  private static formatArray(
    value: any[], 
    functionOutput?: any, 
    depth: number = 0
  ): { html: string; text: string } {
    const indent = '  '.repeat(depth);
    const nextIndent = '  '.repeat(depth + 1);
    
    // Check if this is an array of tuples/structs that need special formatting
    const isArrayOfTuples = functionOutput && 
      (functionOutput.type === 'tuple[]' || 
       (functionOutput.arrayChildren && functionOutput.arrayChildren.components));
    
    console.log(`🎨 [FormatArray] isArrayOfTuples: ${isArrayOfTuples}, functionOutput:`, functionOutput);
    
    if (isArrayOfTuples) {
      // Format array of tuples/structs with proper JSON-like structure
      let html = `<div class="array-container structured-array"><span class="array-bracket">[</span>`;
      let text = '[\n';

      value.forEach((item, index) => {
        const comma = index < value.length - 1 ? ',' : '';
        
        // Get the tuple structure from either the direct output or arrayChildren
        const tupleStructure = functionOutput.arrayChildren || functionOutput;
        
        // Force tuple formatting to use expanded format with proper field names
        const formatted = this.formatTuple(item, tupleStructure, depth + 1, true);
        
        html += `
          <div class="array-item structured-item">
            <div class="item-header">
              <span class="array-index">{</span>
            </div>
            <div class="item-content">${formatted.html}</div>
            <div class="item-footer">
              <span class="array-index">}${comma}</span>
            </div>
          </div>
        `;
        
        text += `${nextIndent}{\n${formatted.text}\n${nextIndent}}${comma}\n`;
      });

      html += `<span class="array-bracket">]</span></div>`;
      text += `${indent}]`;
      
      return { html, text };
    } else {
      // Regular array formatting for simple types
      let html = `<div class="array-container"><span class="array-bracket">[</span>`;
      let text = '[\n';

      value.forEach((item, index) => {
        const formatted = this.formatValue(item, functionOutput?.arrayChildren, depth + 1);
        const comma = index < value.length - 1 ? ',' : '';
        
        html += `
          <div class="array-item">
            <span class="array-index">[${index}]</span>
            <span class="array-value">${formatted.html}</span>${comma}
          </div>
        `;
        
        text += `${nextIndent}[${index}]: ${formatted.text}${comma}\n`;
      });

      html += `<span class="array-bracket">]</span></div>`;
      text += `${indent}]`;
      
      return { html, text };
    }
  }

  private static formatValue(
    value: any, 
    functionOutput?: any, 
    depth: number = 0
  ): { html: string; text: string } {
    if (value === null || value === undefined) {
      return { html: '<span class="null-value">null</span>', text: 'null' };
    }

    const valueType = this.getValueType(value);

    switch (valueType) {
      case 'uint': {
        const formatted = this.formatBigNumber(value);
        return {
          html: `<span class="number-value" title="${value.toString()}">${formatted}</span>`,
          text: formatted
        };
      }

      case 'address': {
        const short = this.formatAddress(value);
        return {
          html: `<span class="address-value" title="${value}">${short}</span>`,
          text: value
        };
      }

      case 'bytes': {
        const formatted = this.formatBytes(value);
        return {
          html: `<span class="bytes-value" title="${value}">${formatted}</span>`,
          text: value
        };
      }

      case 'bool':
        return {
          html: `<span class="bool-value ${value}">${value}</span>`,
          text: value.toString()
        };

      case 'string':
        return {
          html: `<span class="string-value">"${value}"</span>`,
          text: `"${value}"`
        };

      case 'array':
        // Check if this is an array of structured objects and pass the right structure
        if (functionOutput && functionOutput.components) {
          // This is an array of tuples - create the proper structure
          const arrayStructure = {
            type: 'tuple[]',
            arrayChildren: {
              type: 'tuple',
              components: functionOutput.components
            }
          };
          console.log(`🎨 [FormatValue] Detected array of tuples, creating structure:`, arrayStructure);
          return this.formatArray(value, arrayStructure, depth);
        }
        return this.formatArray(value, functionOutput, depth);

      case 'tuple':
        return this.formatTuple(value, functionOutput, depth);

      default:
        return {
          html: `<span class="unknown-value">${value}</span>`,
          text: value.toString()
        };
    }
  }

  public static formatResult(
    result: any, 
    functionObj?: any
  ): FormattedResult {
    const outputs = functionObj?.outputs || [];
    
    console.log(`🎨 [Formatter] Outputs length: ${outputs.length}, Result is array: ${Array.isArray(result)}`);
    
    // Single output
    if (outputs.length === 1) {
      console.log(`🎯 [Formatter] Single output detected: ${outputs[0]?.type}`);
      console.log(`🎯 [Formatter] Single output components:`, outputs[0]?.components);
      
      // If the single output is a tuple with components, format it as a tuple
      if (outputs[0]?.type === 'tuple' && outputs[0]?.components) {
        console.log(`🎯 [Formatter] Single output is a complex tuple, formatting as tuple`);
        const formatted = this.formatTuple(result, outputs[0]);
        return {
          displayValue: formatted.text,
          htmlContent: formatted.html,
          type: 'tuple',
          isComplex: true
        };
      }
      
      // If the single output is an array of tuples, format it as an array
      if (outputs[0]?.type === 'tuple[]' && outputs[0]?.components) {
        console.log(`🎯 [Formatter] Single output is array of tuples, formatting as structured array`);
        // Create array structure with tuple components
        const arrayOutput = {
          type: 'tuple[]',
          arrayChildren: {
            type: 'tuple',
            components: outputs[0].components
          }
        };
        const formatted = this.formatArray(result, arrayOutput);
        return {
          displayValue: formatted.text,
          htmlContent: formatted.html,
          type: 'array',
          isComplex: true
        };
      }
      
      // Regular single output
      const formatted = this.formatValue(result, outputs[0]);
      return {
        displayValue: formatted.text,
        htmlContent: formatted.html,
        type: outputs[0]?.type || this.getValueType(result),
        isComplex: ['array', 'tuple'].includes(this.getValueType(result))
      };
    }

    // Multiple outputs (tuple)
    if (outputs.length > 1 && Array.isArray(result)) {
      console.log(`🎯 [Formatter] Creating tuple with ${outputs.length} components`);
      const tupleOutput = {
        components: outputs.map((output: any, index: number) => ({
          name: output.name || `output_${index}`,
          type: output.type
        }))
      };
      const formatted = this.formatTuple(result, tupleOutput);
      return {
        displayValue: formatted.text,
        htmlContent: formatted.html,
        type: 'tuple',
        isComplex: true
      };
    }

    // Fallback
    const formatted = this.formatValue(result);
    return {
      displayValue: formatted.text,
      htmlContent: formatted.html,
      type: this.getValueType(result),
      isComplex: ['array', 'tuple'].includes(this.getValueType(result))
    };
  }

  public static getCSS(): string {
    return `
      .result-container {
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 12px;
        line-height: 1.4;
        color: #e2e8f0;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 16px;
        max-width: 100%;
        overflow-x: auto;
      }
      
      .tuple-container {
        margin: 0;
        padding: 0;
      }
      
      .tuple-container-inline {
        margin: 0;
        padding: 0;
        display: inline;
        white-space: nowrap;
      }
      
      .tuple-container-lines {
        margin: 0;
        padding: 0;
      }
      
      .tuple-line {
        margin: 0;
        padding: 2px 0;
        display: block;
        line-height: 1.4;
      }
      
      .tuple-field {
        margin: 0;
        padding: 2px 0;
        display: block;
        line-height: 1.4;
        white-space: nowrap;
      }
      
      .field-name {
        color: #60a5fa;
        font-weight: 600;
        display: inline;
        white-space: nowrap;
      }
      
      .field-type {
        color: #9ca3af;
        font-size: 10px;
        font-style: italic;
        display: inline;
        white-space: nowrap;
      }
      
      .field-separator {
        color: #6b7280;
        display: inline;
        white-space: nowrap;
      }
      
      .field-value {
        display: inline;
        white-space: nowrap;
      }
      
      .array-container {
        margin: 0;
      }
      
      .array-item {
        margin: 2px 0 2px 16px;
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      
      .array-index {
        color: #fbbf24;
        font-weight: 600;
        min-width: 40px;
      }
      
      .array-value {
        flex: 1;
      }
      
      .array-bracket {
        color: #6b7280;
        font-weight: bold;
      }
      
      .number-value {
        color: #10b981;
        font-weight: 600;
      }
      
      .address-value {
        color: #8b5cf6;
        font-weight: 600;
        cursor: pointer;
      }
      
      .address-value:hover {
        text-decoration: underline;
      }
      
      .bytes-value {
        color: #f59e0b;
        font-family: monospace;
      }
      
      .bool-value {
        font-weight: 600;
      }
      
      .bool-value.true {
        color: #10b981;
      }
      
      .bool-value.false {
        color: #ef4444;
      }
      
      .string-value {
        color: #22c55e;
      }
      
      .null-value {
        color: #6b7280;
        font-style: italic;
      }
      
      .unknown-value {
        color: #ef4444;
      }
      
      .compact-tuple {
        display: inline;
        color: #e2e8f0;
      }
      
      .compact-field {
        color: #e2e8f0;
      }
      
      .compact-separator {
        color: #6b7280;
        margin: 0 2px;
      }
      
      .tuple-json-style {
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 12px;
        line-height: 1.4;
        color: #e2e8f0;
      }
      
      .json-brace {
        color: #6b7280;
        font-weight: bold;
      }
      
      .json-line {
        color: #e2e8f0;
        margin-left: 0;
      }
      
      .json-comma {
        color: #6b7280;
      }
      
      .array-separator {
        color: #6b7280;
        display: inline;
        white-space: nowrap;
      }
      
      .array-bracket {
        color: #6b7280;
        font-weight: bold;
        display: inline;
        white-space: nowrap;
      }
      
      .array-value {
        color: #10b981;
        display: inline;
      }
      
      .word-wrap-array {
        white-space: normal;
        word-break: break-all;
        word-wrap: break-word;
        line-height: 1.5;
      }
      
      .structured-array {
        margin: 8px 0;
      }
      
      .structured-item {
        margin: 8px 0;
        padding: 8px 0;
        border-left: 2px solid #374151;
        padding-left: 12px;
      }
      
      .item-header, .item-footer {
        color: #6b7280;
        font-weight: bold;
        font-size: 14px;
      }
      
      .item-content {
        margin: 4px 0;
        padding-left: 8px;
      }
      
      .item-content .tuple-line {
        margin: 2px 0;
        padding: 1px 0;
      }
    `;
  }
}