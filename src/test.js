const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const API_BASE = 'http://localhost:3000';

async function testPuppeteerGLBRenderer() {
    console.log('🧪 Testing Puppeteer GLB Renderer...\n');

    try {
        // Test 1: Health Check
        console.log('1. Health Check...');
        const health = await axios.get(`${API_BASE}/health`);
        console.log('✅ Health:', health.data.status);
        console.log(`   Puppeteer: ${health.data.puppeteer?.status || 'Unknown'}`);
        console.log(`   Jobs: ${JSON.stringify(health.data.jobs)}`);
        console.log();

        // Test 2: List Files
        console.log('2. List Available GLB Files...');
        const files = await axios.get(`${API_BASE}/api/files`);
        console.log(`✅ Found ${files.data.count} GLB files:`);
        files.data.files.forEach(file => {
            console.log(`   - ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        });
        console.log();

        if (files.data.count === 0) {
            console.log('⚠️ No GLB files found. Please add GLB files to storage/uploads directory.');
            return;
        }

        // Test 3: Render Single View
        console.log('3. Testing Single View Render...');
        const firstFile = files.data.files[0].name;
        
        const renderJob = await axios.post(`${API_BASE}/api/render`, {
            fileName: firstFile,
            options: {
                width: 800,
                height: 600,
                format: 'png',
                views: ['perspective'],
                lighting: 'studio',
                preset: 'high',
                background: '#ffffff'
            }
        });
        
        console.log(`✅ Render job started: ${renderJob.data.jobId}`);
        
        // Wait for completion
        let job = null;
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds max
        
        while (attempts < maxAttempts) {
            await sleep(1000);
            const jobStatus = await axios.get(`${API_BASE}/api/job/${renderJob.data.jobId}`);
            job = jobStatus.data.job;
            
            console.log(`   Status: ${job.status} (${job.progress}%)`);
            
            if (job.status === 'completed' || job.status === 'failed') {
                break;
            }
            
            attempts++;
        }
        
        if (job?.status === 'completed') {
            console.log('✅ Render completed successfully!');
            console.log(`   Results: ${job.result.results.length} files`);
            job.result.results.forEach(result => {
                console.log(`   - ${result.fileName} (${(result.size / 1024).toFixed(1)}KB)`);
            });
        } else {
            console.log(`❌ Render failed or timed out. Status: ${job?.status || 'timeout'}`);
            if (job?.error) {
                console.log(`   Error: ${job.error}`);
            }
        }
        console.log();

        // Test 4: Multi-View Render
        console.log('4. Testing Multi-View Render...');
        const multiViewJob = await axios.post(`${API_BASE}/api/render`, {
            fileName: firstFile,
            options: {
                width: 512,
                height: 512,
                format: 'png',
                views: ['front', 'side', 'top', 'perspective'],
                lighting: 'outdoor',
                preset: 'medium'
            }
        });
        
        console.log(`✅ Multi-view job started: ${multiViewJob.data.jobId}`);
        console.log('   (Job running in background - check status with API)');
        console.log();

        // Test 5: Video Render (Turntable)
        console.log('5. Testing Video Render (Turntable)...');
        const videoJob = await axios.post(`${API_BASE}/api/render`, {
            fileName: firstFile,
            options: {
                width: 640,
                height: 480,
                format: 'mp4',
                turntable: true,
                duration: 3,
                fps: 24,
                lighting: 'dramatic',
                preset: 'medium',
                background: '#000000'
            }
        });
        
        console.log(`✅ Video job started: ${videoJob.data.jobId}`);
        console.log('   (Video rendering takes longer - check status with API)');
        console.log();

        // Test 6: Show Current Jobs
        console.log('6. Current Jobs Status...');
        const healthCheck = await axios.get(`${API_BASE}/health`);
        const jobStats = healthCheck.data.jobs;
        console.log(`✅ Queue Status:`);
        console.log(`   Total: ${jobStats.total}`);
        console.log(`   Pending: ${jobStats.pending}`);
        console.log(`   Processing: ${jobStats.processing}`);
        console.log(`   Completed: ${jobStats.completed}`);
        console.log(`   Failed: ${jobStats.failed}`);
        console.log();

        console.log('🎉 Test completed! Check the results in storage/renders directory.');
        console.log(`📁 Storage: ${healthCheck.data.storage.renders} render files available`);
        console.log(`🌐 Web Interface: ${API_BASE}`);
        console.log(`🎨 GLB Viewer: ${API_BASE}/viewer/glb-viewer.html`);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response?.data) {
            console.error('   Response:', error.response.data);
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run test if called directly
if (require.main === module) {
    testPuppeteerGLBRenderer();
}

module.exports = testPuppeteerGLBRenderer;