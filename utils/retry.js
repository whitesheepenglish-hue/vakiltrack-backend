const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const retry = async (fn, options = {}) => {
    const {
        retries = 3,
        delay = 1000,
        factor = 2,
        onRetry = null
    } = options;

    let attempt = 0;

    while (attempt < retries) {
        try {
            return await fn();
        } catch (error) {
            attempt++;

            if (attempt >= retries) {
                throw error;
            }

            const waitTime = delay * Math.pow(factor, attempt - 1);

            if (onRetry) {
                onRetry(error, attempt, waitTime);
            }

            await sleep(waitTime);
        }
    }
};

module.exports = retry;