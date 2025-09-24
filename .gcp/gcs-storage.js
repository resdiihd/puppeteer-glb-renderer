// Google Cloud Storage integration for GLB files
const { Storage } = require('@google-cloud/storage');

class GCSStorageManager {
    constructor(bucketName, projectId) {
        this.storage = new Storage({ projectId });
        this.bucket = this.storage.bucket(bucketName);
        this.bucketName = bucketName;
    }

    /**
     * Upload GLB file to Google Cloud Storage
     * @param {string} localFilePath - Local file path
     * @param {string} destinationName - Destination filename in GCS
     * @returns {Promise<string>} - Public URL
     */
    async uploadGLBFile(localFilePath, destinationName) {
        try {
            console.log(`📤 Uploading ${localFilePath} to GCS...`);
            
            const [file] = await this.bucket.upload(localFilePath, {
                destination: destinationName,
                metadata: {
                    cacheControl: 'public, max-age=86400', // 24 hours
                    contentType: 'model/gltf-binary'
                },
                public: true
            });

            const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${destinationName}`;
            console.log(`✅ File uploaded successfully: ${publicUrl}`);
            
            return publicUrl;
        } catch (error) {
            console.error('❌ GCS upload failed:', error);
            throw error;
        }
    }

    /**
     * Download GLB file from Google Cloud Storage
     * @param {string} fileName - File name in GCS
     * @param {string} localDestination - Local destination path
     * @returns {Promise<string>} - Local file path
     */
    async downloadGLBFile(fileName, localDestination) {
        try {
            console.log(`📥 Downloading ${fileName} from GCS...`);
            
            await this.bucket.file(fileName).download({
                destination: localDestination
            });
            
            console.log(`✅ File downloaded successfully: ${localDestination}`);
            return localDestination;
        } catch (error) {
            console.error('❌ GCS download failed:', error);
            throw error;
        }
    }

    /**
     * List all GLB files in the bucket
     * @returns {Promise<Array>} - Array of file objects
     */
    async listGLBFiles() {
        try {
            const [files] = await this.bucket.getFiles({
                prefix: 'glb/',
                delimiter: '/'
            });

            const glbFiles = files
                .filter(file => file.name.endsWith('.glb'))
                .map(file => ({
                    name: file.name,
                    size: file.metadata.size,
                    created: file.metadata.timeCreated,
                    updated: file.metadata.updated,
                    publicUrl: `https://storage.googleapis.com/${this.bucketName}/${file.name}`
                }));

            return glbFiles;
        } catch (error) {
            console.error('❌ Failed to list GCS files:', error);
            throw error;
        }
    }

    /**
     * Delete GLB file from Google Cloud Storage
     * @param {string} fileName - File name to delete
     * @returns {Promise<boolean>} - Success status
     */
    async deleteGLBFile(fileName) {
        try {
            console.log(`🗑️ Deleting ${fileName} from GCS...`);
            
            await this.bucket.file(fileName).delete();
            
            console.log(`✅ File deleted successfully: ${fileName}`);
            return true;
        } catch (error) {
            console.error('❌ GCS deletion failed:', error);
            throw error;
        }
    }

    /**
     * Upload rendered results to GCS
     * @param {string} localFilePath - Local rendered file
     * @param {string} jobId - Job ID for organization
     * @param {string} fileName - Original GLB filename
     * @returns {Promise<string>} - Public URL
     */
    async uploadRenderedResult(localFilePath, jobId, fileName) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const extension = localFilePath.split('.').pop();
        const destinationName = `renders/${fileName}/${jobId}_${timestamp}.${extension}`;
        
        return this.uploadGLBFile(localFilePath, destinationName);
    }

    /**
     * Setup CORS for web access
     */
    async setupCORS() {
        try {
            const corsConfiguration = [{
                origin: ['*'],
                method: ['GET', 'HEAD'],
                responseHeader: ['Content-Type'],
                maxAgeSeconds: 3600
            }];

            await this.bucket.setCorsConfiguration(corsConfiguration);
            console.log('✅ CORS configuration applied to bucket');
        } catch (error) {
            console.error('❌ Failed to set CORS:', error);
            throw error;
        }
    }
}

module.exports = GCSStorageManager;