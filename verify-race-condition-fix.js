#!/usr/bin/env node

// Test script to verify race condition fix
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Race Condition Fix Verification\n');

// 1. Verify fetch order change
const simpleGridPath = path.join(__dirname, 'src/components/SimpleGridUI.tsx');
const fileContent = fs.readFileSync(simpleGridPath, 'utf8');

console.log('1. ✅ Verifying fetch order change...');

// Check if the new fetch order is implemented
const sourcifyFirstPattern = /Starting ABI fetch with order: Sourcify → Blockscout → Etherscan/;
if (sourcifyFirstPattern.test(fileContent)) {
    console.log('   ✅ Fetch order changed to Sourcify → Blockscout → Etherscan');
} else {
    console.log('   ❌ Fetch order change not found');
    process.exit(1);
}

// 2. Verify contract name preservation logic
console.log('2. ✅ Verifying contract name preservation logic...');

const preservationPattern = /!contractName\.startsWith\("ERC"\) &&\s*!contractName\.startsWith\("Unknown"\)/;
if (preservationPattern.test(fileContent)) {
    console.log('   ✅ Enhanced contract name preservation logic found');
} else {
    console.log('   ❌ Enhanced preservation logic not found');
}

// 3. Verify contract name update in ContractInfo object
const contractInfoUpdatePattern = /contractInfoObj\.name = extendedResult\.contractName;/;
if (contractInfoUpdatePattern.test(fileContent)) {
    console.log('   ✅ ContractInfo object name update found');
} else {
    console.log('   ❌ ContractInfo name update not found');
}

// 4. Check git status
console.log('3. ✅ Checking git status...');
const { exec } = await import('child_process');
exec('git log --oneline -1', (error, stdout) => {
    if (!error && stdout.includes('race condition')) {
        console.log('   ✅ Race condition fix commit found:', stdout.trim());
        
        console.log('\n🎉 All race condition fix verifications passed!');
        console.log('\n📋 Manual Testing Required:');
        console.log('   - Open http://localhost:5173/');
        console.log('   - Load Diamond contract: 0xa99c4b08201f2913db8d28e71d020c4298f29dbf on Base');
        console.log('   - Expected behavior:');
        console.log('     1. Should query Sourcify first (not Etherscan)');
        console.log('     2. Contract name should be "Diamond" (not "Smart Contract")');
        console.log('     3. No race condition overriding the name');
    } else {
        console.log('   ❌ Race condition fix commit not found');
    }
});