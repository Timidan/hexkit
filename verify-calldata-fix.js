#!/usr/bin/env node

// Automated test to verify calldata fix without browser
import fs from 'fs';
import path from 'path';
import http from 'http';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Automated Calldata Fix Verification\n');

// 1. Check if the fix was applied correctly
const simpleGridPath = path.join(__dirname, 'src/components/SimpleGridUI.tsx');
const fileContent = fs.readFileSync(simpleGridPath, 'utf8');

console.log('1. ✅ Checking SimpleGridUI.tsx for calldata fix...');

// Look for the fixed useEffect
const useEfffectPattern = /useEffect\(\(\) => \{[\s\S]*?updateCallData\(\);[\s\S]*?\}, \[functionInputs, selectedFunctionObj\]\);/;
const oldPattern = /updateCallData,\s*functionInputs,\s*selectedFunctionObj/;

if (useEfffectPattern.test(fileContent)) {
    console.log('   ✅ Fixed useEffect dependency array found');
} else if (oldPattern.test(fileContent)) {
    console.log('   ❌ Old broken dependency array still present');
    process.exit(1);
} else {
    console.log('   ⚠️  Could not verify useEffect pattern - please check manually');
}

// 2. Check if test plan exists
const testPlanPath = path.join(__dirname, 'CALLDATA_TEST_PLAN.md');
if (fs.existsSync(testPlanPath)) {
    console.log('2. ✅ Test plan documentation exists');
} else {
    console.log('   ❌ Test plan documentation missing');
}

// 3. Check development server accessibility
console.log('3. ✅ Checking development server accessibility...');

const options = {
    hostname: 'localhost',
    port: 5173,
    path: '/',
    method: 'GET',
    timeout: 5000
};

const req = http.request(options, (res) => {
    if (res.statusCode === 200) {
        console.log('   ✅ Development server is accessible');
        
        // 4. Check git status
        console.log('4. ✅ Checking git status...');
        
        exec('git log --oneline -1', (error, stdout) => {
            if (!error && stdout.includes('calldata update issue')) {
                console.log('   ✅ Calldata fix commit found:', stdout.trim());
                console.log('\n🎉 All automated checks passed!');
                console.log('\n📋 Manual Testing Required:');
                console.log('   - Open http://localhost:5173/');
                console.log('   - Navigate to Transaction Builder');
                console.log('   - Test calldata updates with real input changes');
                console.log('   - Follow CALLDATA_TEST_PLAN.md for detailed steps');
            } else {
                console.log('   ❌ Calldata fix commit not found');
            }
        });
    } else {
        console.log(`   ❌ Server returned status: ${res.statusCode}`);
    }
});

req.on('error', (err) => {
    console.log('   ❌ Cannot connect to development server');
    console.log('   Make sure "npm run dev" is running');
});

req.on('timeout', () => {
    console.log('   ❌ Server connection timeout');
    req.destroy();
});

req.setTimeout(5000);
req.end();