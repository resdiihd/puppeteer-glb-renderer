#!/usr/bin/env node

console.log('🔍 GLB Renderer Startup Debug');
console.log('===============================');

// Basic environment checks
console.log('📋 Environment Information:');
console.log('  Node.js version:', process.version);
console.log('  Platform:', process.platform);
console.log('  Architecture:', process.arch);
console.log('  Current directory:', process.cwd());
console.log('  Memory usage:', process.memoryUsage());

// Check required environment variables
console.log('\n🌐 Environment Variables:');
const requiredEnvs = ['NODE_ENV', 'PORT', 'HOST'];
requiredEnvs.forEach(env => {
    console.log(`  ${env}: ${process.env[env] || '(not set)'}`);
});

// Check if required files exist
console.log('\n📁 Required Files Check:');
const fs = require('fs');
const path = require('path');

const requiredFiles = [
    'src/app.js',
    'src/config/config.js',
    'src/utils/logger.js',
    'package.json'
];

let allFilesExist = true;
requiredFiles.forEach(file => {
    const exists = fs.existsSync(path.join(__dirname, file));
    console.log(`  ${file}: ${exists ? '✅' : '❌'}`);
    if (!exists) allFilesExist = false;
});

// Check node_modules
console.log('\n📦 Dependencies Check:');
const nodeModulesExists = fs.existsSync(path.join(__dirname, 'node_modules'));
console.log(`  node_modules: ${nodeModulesExists ? '✅' : '❌'}`);

if (nodeModulesExists) {
    const packageJson = require('./package.json');
    const dependencies = Object.keys(packageJson.dependencies || {});
    
    console.log(`  Checking ${dependencies.length} dependencies...`);
    dependencies.forEach(dep => {
        try {
            require.resolve(dep);
            console.log(`    ${dep}: ✅`);
        } catch (error) {
            console.log(`    ${dep}: ❌ (${error.code})`);
            allFilesExist = false;
        }
    });
}

// Try to load main modules
console.log('\n🔧 Module Loading Test:');
try {
    const config = require('./src/config/config');
    console.log('  Config loaded: ✅');
    console.log(`    Server port: ${config.server.port}`);
    console.log(`    Server host: ${config.server.host}`);
} catch (error) {
    console.log('  Config loaded: ❌', error.message);
    allFilesExist = false;
}

try {
    const logger = require('./src/utils/logger');
    console.log('  Logger loaded: ✅');
} catch (error) {
    console.log('  Logger loaded: ❌', error.message);
    allFilesExist = false;
}

// Test Express
try {
    const express = require('express');
    console.log('  Express loaded: ✅');
} catch (error) {
    console.log('  Express loaded: ❌', error.message);
    allFilesExist = false;
}

console.log('\n📊 Summary:');
if (allFilesExist) {
    console.log('✅ All checks passed - environment should be ready');
    
    // Try to actually start the app
    console.log('\n🚀 Testing application startup...');
    try {
        const GLBRendererServer = require('./src/app');
        const server = new GLBRendererServer();
        console.log('✅ Application class instantiated successfully');
        
        // Don't actually start the server in debug mode
        console.log('✅ Debug completed - app should be ready to start');
        process.exit(0);
    } catch (error) {
        console.log('❌ Application startup test failed:', error.message);
        console.log('Stack trace:', error.stack);
        process.exit(1);
    }
} else {
    console.log('❌ Some checks failed - please fix the issues above');
    process.exit(1);
}