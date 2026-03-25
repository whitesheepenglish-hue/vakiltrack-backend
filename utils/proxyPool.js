const proxies = [
    { url: "http://proxy1:port", fails: 0 },
    { url: "http://proxy2:port", fails: 0 }
];

const MAX_FAILS = 3;

const getNextProxy = () => {
    const validProxies = proxies.filter((proxy) => proxy.fails < MAX_FAILS);

    if (validProxies.length === 0) {
        throw new Error("All proxies exhausted");
    }

    const proxy = validProxies[Math.floor(Math.random() * validProxies.length)];
    return proxy.url;
};

const markProxyFailure = (proxyUrl) => {
    const proxy = proxies.find((entry) => entry.url === proxyUrl);
    if (proxy) proxy.fails++;
};

module.exports = { getNextProxy, markProxyFailure };
