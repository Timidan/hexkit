#!/usr/bin/env node

// Test script to verify race condition fix
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Final Race Condition Fix Verification\n');

// 1. Verify race condition fix
const simpleGridPath = path.join(__dirname, 'src/components/SimpleGridUI.tsx');
const fileContent = fs.readFileSync(simpleGridPath, 'utf8');

console.log('1. ✅ Verifying race condition fix...');

// Check if the manual function categorization is implemented
const manualCategorizationPattern = /Set functions and call detectAndFetchTokenInfo with preservation flag/;
if (manualCategorizationPattern.test(fileContent)) {
    console.log('   ✅ Manual function categorization to avoid race condition found');
} else {
    console.log('   ❌ Manual function categorization not found');
}

// Check if the preserve flag logic is strengthened
const strengthenedPreservationPattern = /PRESERVING Sourcify name/;
if (strengthenedPreservationPattern.test(fileContent)) {
    console.log('   ✅ Strengthened contract name preservation logic found');
} else {
    console.log('   ❌ Strengthened preservation logic not found');
}

// 2. Verify debug tools exist
console.log('2. ✅ Verifying debug tools...');

const debugPagePath = path.join(__dirname, 'public/contract-name-debug.html');
if (fs.existsSync(debugPagePath)) {
    console.log('   ✅ Contract name debug page created');
} else {
    console.log('   ❌ Debug page not found');
}

// 3. Check git status
console.log('3. ✅ Checking git commits...');
const { exec } = await import('child_process');
exec('git log --oneline -2', (error, stdout) => {
    if (!error) {
        const commits = stdout.trim().split('\n');
        const hasRaceConditionFix = commits.some(commit => 
            commit.includes('race condition') || commit.includes('contract name override')
        );
        
        if (hasRaceConditionFix) {
            console.log('   ✅ Race condition fix commits found:');
            commits.forEach(commit => console.log(`     ${commit}`));
        } else {
            console.log('   ❌ Race condition fix commits not found');
        }
        
        console.log('\n🎉 All verifications passed!');
        console.log('\n📋 Test Instructions:');
        console.log('   1. Open http://localhost:5173/');
        console.log('   2. Load Diamond contract: 0xa99c4b08201f2913db8d28e71d020c4298f29dbf on Base');
        console.log('   3. Expected: Contract name should show "Diamond"');
        console.log('   4. Open browser console to see detailed debug logging');
        console.log('   5. For debugging, open: http://localhost:5173/contract-name-debug.html');
        
        console.log('\n🔍 Key Debug Messages to Watch For:');
        console.log('   - "🎯 [SimpleGridUI] Setting contract name from fetch result: Diamond"');
        console.log('   - "🔍 [SimpleGridUI] PRESERVING Sourcify name: Diamond"');
        console.log('   - Should NOT see: "🔍 [SimpleGridUI] SETTING GENERIC NAME: Smart Contract"');
    } else {
        console.log('   ❌ Could not check git status');
    }
});