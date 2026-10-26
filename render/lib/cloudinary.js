const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');

class CloudinaryManager {
  constructor() {
    this.refreshConfig();
  }

  refreshConfig() {
    this.cloudName = process.env.CLOUDINARY_CLOUD_NAME || null;
    this.apiKey = process.env.CLOUDINARY_API_KEY || null;
    this.apiSecret = process.env.CLOUDINARY_API_SECRET || null;

    if (process.env.CLOUDINARY_URL) {
      try {
        // format: cloudinary://api_key:api_secret@cloud_name
        const parsed = new URL(process.env.CLOUDINARY_URL);
        this.apiKey = parsed.username || this.apiKey;
        this.apiSecret = parsed.password || this.apiSecret;
        this.cloudName = parsed.hostname || this.cloudName;
      } catch (e) {
        console.warn('[Cloudinary] Failed to parse CLOUDINARY_URL:', e.message);
      }
    }
  }

  isConfigured() {
    this.refreshConfig();
    return !!(this.cloudName && this.apiKey && this.apiSecret);
  }

  getStatus() {
    this.refreshConfig();
    const configured = this.isConfigured();
    return {
      configured,
      cloudName: this.cloudName || null,
      apiKeyMasked: this.apiKey ? `${this.apiKey.substring(0, 4)}...${this.apiKey.slice(-2)}` : null,
      provider: 'Cloudinary CDN'
    };
  }

  /**
   * Uploads a Buffer, Base64 string, or Stream to Cloudinary
   * @param {Buffer|string} fileBuffer - Buffer or data URI / base64 string
   * @param {Object} options - { resourceType: 'auto'|'image'|'video'|'raw', folder: 'zaid-bot-media' }
   */
  async upload(fileBuffer, options = {}) {
    this.refreshConfig();
    if (!this.isConfigured()) {
      throw new Error('Cloudinary is not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = options.folder || 'zaid-bot-media';
    const resourceType = options.resourceType || 'auto';

    // Generate SHA1 Signature
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}${this.apiSecret}`;
    const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');

    const form = new FormData();
    form.append('timestamp', timestamp);
    form.append('api_key', this.apiKey);
    form.append('signature', signature);
    form.append('folder', folder);

    if (Buffer.isBuffer(fileBuffer)) {
      form.append('file', fileBuffer, { filename: options.filename || 'upload.bin' });
    } else if (typeof fileBuffer === 'string' && fileBuffer.startsWith('data:')) {
      form.append('file', fileBuffer);
    } else if (typeof fileBuffer === 'string') {
      // base64 or url
      form.append('file', fileBuffer);
    } else {
      throw new Error('Invalid file format provided for Cloudinary upload');
    }

    const endpoint = `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/upload`;

    const response = await axios.post(endpoint, form, {
      headers: form.getHeaders(),
      timeout: 30000
    });

    return {
      success: true,
      url: response.data.url,
      secure_url: response.data.secure_url,
      public_id: response.data.public_id,
      format: response.data.format,
      bytes: response.data.bytes
    };
  }
}

module.exports = new CloudinaryManager();
