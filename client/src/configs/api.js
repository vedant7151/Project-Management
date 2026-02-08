import axios from 'axios'


const api = axios.create({
    baseURL : import.meta.env.VITE_BASE_URL
})

// Add retry interceptor for robust requests (fixes cold start issues)
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const config = error.config;
        
        // Skip if no config or if we shouldn't retry
        if (!config || config.sent) {
            return Promise.reject(error);
        }

        // Set default retry count if not present
        config.retryCount = config.retryCount || 0;
        const MAX_RETRIES = 2;

        // Check if we should retry (Network Error or 5xx Server Error)
        // We do NOT retry 4xx errors (client errors like 401, 403, 404)
        const shouldRetry = 
            error.code === 'ERR_NETWORK' || 
            (error.response && error.response.status >= 500);

        if (shouldRetry && config.retryCount < MAX_RETRIES) {
            config.retryCount += 1;
            config.sent = true; // Mark as retrying to prevent infinite loops if logic fails
            
            // Exponential backoff: 1s, 2s...
            const delay = 1000 * config.retryCount;
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Reset "sent" flag for the new request object returned by api(config)
            // Actually, we just need to call api(config). 
            // Better to clone config to avoid mutation issues, but generic retry usually does:
            const newConfig = { ...config, sent: false };
            return api(newConfig);
        }

        return Promise.reject(error);
    }
);

export default api

