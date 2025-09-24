const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class JobQueue extends EventEmitter {
    constructor() {
        super();
        this.jobs = new Map();
        this.queue = [];
        this.isProcessing = false;
        this.concurrency = 2; // Process 2 jobs concurrently
        this.activeJobs = 0;
        this.renderer = null;
    }

    start(renderer) {
        this.renderer = renderer;
        console.log('🚀 Job queue started');
        this.processQueue();
    }

    stop() {
        this.isProcessing = false;
        console.log('🛑 Job queue stopped');
    }

    async addJob(jobData) {
        const jobId = uuidv4();
        const job = {
            id: jobId,
            ...jobData,
            status: 'pending',
            createdAt: new Date(),
            startedAt: null,
            completedAt: null,
            progress: 0,
            result: null,
            error: null
        };

        this.jobs.set(jobId, job);
        this.queue.push(job);

        console.log(`📋 Job added to queue: ${jobId} (${job.type})`);
        this.emit('jobAdded', job);

        // Start processing if not already
        if (!this.isProcessing) {
            this.processQueue();
        }

        return jobId;
    }

    getJob(jobId) {
        return this.jobs.get(jobId) || null;
    }

    getAllJobs() {
        return Array.from(this.jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    getStats() {
        const jobs = Array.from(this.jobs.values());
        return {
            total: jobs.length,
            pending: jobs.filter(j => j.status === 'pending').length,
            processing: jobs.filter(j => j.status === 'processing').length,
            completed: jobs.filter(j => j.status === 'completed').length,
            failed: jobs.filter(j => j.status === 'failed').length,
            activeJobs: this.activeJobs,
            queueLength: this.queue.length
        };
    }

    async processQueue() {
        if (!this.renderer) {
            console.warn('⚠️ No renderer available for job processing');
            return;
        }

        this.isProcessing = true;

        while (this.isProcessing && (this.queue.length > 0 || this.activeJobs > 0)) {
            // Process jobs up to concurrency limit
            while (this.activeJobs < this.concurrency && this.queue.length > 0) {
                const job = this.queue.shift();
                this.processJob(job);
            }

            // Wait a bit before checking again
            await this.sleep(1000);
        }

        this.isProcessing = false;
    }

    async processJob(job) {
        this.activeJobs++;
        
        try {
            console.log(`🎨 Processing job: ${job.id} (${job.type})`);
            
            // Update job status
            job.status = 'processing';
            job.startedAt = new Date();
            this.jobs.set(job.id, job);
            this.emit('jobStarted', job);

            let result;

            switch (job.type) {
                case 'render':
                    result = await this.processRenderJob(job);
                    break;
                case 'batch':
                    result = await this.processBatchJob(job);
                    break;
                default:
                    throw new Error(`Unknown job type: ${job.type}`);
            }

            // Job completed successfully
            job.status = 'completed';
            job.completedAt = new Date();
            job.progress = 100;
            job.result = result;
            this.jobs.set(job.id, job);

            console.log(`✅ Job completed: ${job.id}`);
            this.emit('jobCompleted', job);

        } catch (error) {
            // Job failed
            console.error(`❌ Job failed: ${job.id}`, error);
            
            job.status = 'failed';
            job.completedAt = new Date();
            job.error = error.message;
            this.jobs.set(job.id, job);
            
            this.emit('jobFailed', job);
        } finally {
            this.activeJobs--;
        }
    }

    async processRenderJob(job) {
        const { fileName, options } = job;

        // Update progress during rendering
        const progressCallback = (progress) => {
            job.progress = Math.min(progress, 95); // Leave 5% for final processing
            this.jobs.set(job.id, job);
            this.emit('jobProgress', job);
        };

        // Add progress tracking to options
        const renderOptions = {
            ...options,
            progressCallback
        };

        // Perform the actual rendering
        const result = await this.renderer.renderGLB(fileName, renderOptions);

        // Final progress update
        job.progress = 100;
        this.jobs.set(job.id, job);

        return result;
    }

    async processBatchJob(job) {
        const { files, options } = job;
        const results = [];
        const totalFiles = files.length;

        console.log(`🔄 Processing batch job with ${totalFiles} files`);

        for (let i = 0; i < totalFiles; i++) {
            const fileName = files[i];
            
            try {
                console.log(`📁 Processing file ${i + 1}/${totalFiles}: ${fileName}`);
                
                // Update progress
                job.progress = Math.floor((i / totalFiles) * 95);
                this.jobs.set(job.id, job);
                this.emit('jobProgress', job);

                // Render individual file
                const renderResult = await this.renderer.renderGLB(fileName, options);
                
                results.push({
                    fileName,
                    success: true,
                    result: renderResult
                });

            } catch (error) {
                console.error(`❌ Failed to process ${fileName}:`, error);
                
                results.push({
                    fileName,
                    success: false,
                    error: error.message
                });
            }
        }

        return {
            type: 'batch',
            totalFiles,
            results,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
        };
    }

    // Cleanup old completed jobs
    cleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
        const cutoff = new Date(Date.now() - maxAge);
        let cleaned = 0;

        for (const [jobId, job] of this.jobs.entries()) {
            if (job.completedAt && job.completedAt < cutoff) {
                this.jobs.delete(jobId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Cleaned up ${cleaned} old jobs`);
        }

        return cleaned;
    }

    // Cancel a pending job
    cancelJob(jobId) {
        const job = this.jobs.get(jobId);
        
        if (!job) {
            return false;
        }

        if (job.status === 'pending') {
            // Remove from queue
            const queueIndex = this.queue.findIndex(j => j.id === jobId);
            if (queueIndex !== -1) {
                this.queue.splice(queueIndex, 1);
            }

            job.status = 'cancelled';
            job.completedAt = new Date();
            this.jobs.set(jobId, job);
            
            console.log(`🚫 Job cancelled: ${jobId}`);
            this.emit('jobCancelled', job);
            return true;
        }

        return false; // Can't cancel running or completed jobs
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = JobQueue;