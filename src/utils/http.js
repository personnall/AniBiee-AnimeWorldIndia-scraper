const axios = require('axios');
const { logger } = require('./logger');

class HttpClient {
  constructor() {
    this.client = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    this.setupInterceptors();
  }

  setupInterceptors() {
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`HTTP Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('HTTP Request Error', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`HTTP Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error(
          `HTTP Error: ${error.response?.status || 'Unknown'} ${error.config?.url || 'Unknown URL'}`,
          error
        );
        return Promise.reject(error);
      }
    );
  }

  async get(url, options = {}) {
    // Automatically add Referer if not provided to bypass some Cloudflare checks
    const headers = {
      ...this.client.defaults.headers,
      ...options?.headers,
    };

    if (!headers.Referer && !headers.referer) {
      try {
        const urlObj = new URL(url);
        headers.Referer = `${urlObj.origin}/`;
      } catch (e) {
        // Fallback or ignore if invalid URL
      }
    }

    const config = {
      url,
      method: 'GET',
      timeout: options?.timeout,
      headers,
    };

    let lastError;
    const retries = options?.retries ?? 0;
    const retryDelay = options?.retryDelay ?? 1000;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.client.request(config);
        return response.data;
      } catch (error) {
        lastError = error;

        // Special handling for 403 Forbidden - could be Cloudflare blocking
        if (error.response?.status === 403 && attempt === 0) {
          try {
            const urlObj = new URL(url);
            const rootUrl = `${urlObj.origin}/`;
            if (url !== rootUrl) {
              logger.info(`Received 403. Attempting warm-up request to ${rootUrl}`);
              // Silent warm-up request to the root domain
              await this.client.request({
                url: rootUrl,
                method: 'GET',
                headers: { ...headers, Referer: 'https://www.google.com/' }
              });
              // No need to wait, just retry the original request immediately
              continue;
            }
          } catch (e) {
            // Ignore warm-up errors
          }
        }

        if (attempt < retries) {
          logger.warn(`Request failed, retrying... (${attempt + 1}/${retries})`);
          await this.delay(retryDelay * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  async getBuffer(url, options = {}) {
    const config = {
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: options?.timeout,
      headers: {
        ...this.client.defaults.headers,
        ...options?.headers,
      },
    };

    const response = await this.client.request(config);
    return Buffer.from(response.data);
  }

  async post(url, data, options = {}) {
    const headers = {
      ...this.client.defaults.headers,
      ...options?.headers,
    };

    if (!headers.Referer && !headers.referer) {
      try {
        const urlObj = new URL(url);
        headers.Referer = `${urlObj.origin}/`;
      } catch (e) {
        // Fallback or ignore if invalid URL
      }
    }

    const config = {
      url,
      method: 'POST',
      data,
      timeout: options?.timeout,
      headers,
    };

    let lastError;
    const retries = options?.retries ?? 0;
    const retryDelay = options?.retryDelay ?? 1000;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.client.request(config);
        return response.data;
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          logger.warn(`Request failed, retrying... (${attempt + 1}/${retries})`);
          await this.delay(retryDelay * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const httpClient = new HttpClient();

module.exports = { httpClient };
