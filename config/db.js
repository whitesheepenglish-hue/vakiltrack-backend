require("./loadEnv");

const mongoose = require("mongoose");
const { redactUrl, validateMongoUri } = require("./validateEnv");

const DEFAULT_URI = "mongodb://127.0.0.1:27017/vakiltrack";
const DEFAULT_DB_NAME = "vakiltrack";
const MAX_CONNECT_ATTEMPTS = 5;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 15_000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sanitizeMongoUri(uri) {
  return redactUrl(uri);
}

function assertEncodedCredentials(uri) {
  const value = String(uri || "").trim();

  if (!value.startsWith("mongodb://") && !value.startsWith("mongodb+srv://")) {
    return;
  }

  const withoutScheme = value.replace(/^mongodb(?:\+srv)?:\/\//, "");
  const authority = withoutScheme.split("/")[0] || "";

  // Multiple "@" signs usually mean the password contains an unencoded "@",
  // which breaks URI parsing during auth and server discovery.
  if ((authority.match(/@/g) || []).length > 1) {
    throw new Error(
      "MONGO_URI contains an unencoded '@' in the username or password. URL-encode special characters, for example '@' -> '%40'."
    );
  }
}

function normalizeMongoUri(value) {
  const uri = String(value || "").trim();

  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    return uri;
  }

  try {
    const parsed = new URL(uri);
    const pathName = parsed.pathname.replace(/^\/+/, "");

    // Atlas URIs often omit the app DB name. Default it so models stay scoped
    // to the expected database in both local and hosted environments.
    if (!pathName) {
      parsed.pathname = `/${DEFAULT_DB_NAME}`;
    }

    return parsed.toString();
  } catch {
    return uri;
  }
}

function buildConnectionCandidates(mongoUri) {
  const candidates = [mongoUri, process.env.MONGO_URI, process.env.MONGODB_URI]
    .map((value) => normalizeMongoUri(value))
    .filter(Boolean);

  if (candidates.length === 0) {
    return [DEFAULT_URI];
  }

  return [...new Set(candidates)];
}

function createDnsHelpMessage(uri, err) {
  const sanitizedUri = sanitizeMongoUri(uri);
  const errorCode = String(err?.code || "");
  const syscall = String(err?.syscall || "");
  const hostname = String(err?.hostname || "");

  if (syscall === "querySrv" || errorCode === "ECONNREFUSED") {
    return `MongoDB SRV DNS lookup failed for ${hostname || "the Atlas cluster"}. Switch MONGO_URI to the standard mongodb:// host list format. Attempted URI: ${sanitizedUri}`;
  }

  if (errorCode === "ENOTFOUND") {
    return `MongoDB hostname lookup failed. Verify the Atlas hostnames and DNS availability. Attempted URI: ${sanitizedUri}`;
  }

  return `MongoDB connection failed for ${sanitizedUri}`;
}

async function connectWithRetry(uri) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
    try {
      console.log(`MongoDB connect attempt ${attempt}/${MAX_CONNECT_ATTEMPTS}: ${sanitizeMongoUri(uri)}`);

      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000,
        family: 4,
        serverApi: {
          version: mongoose.mongo.ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        },
      });

      await mongoose.connection.db.admin().command({ ping: 1 });
      console.log(`MongoDB connected: ${sanitizeMongoUri(uri)}`);
      return mongoose.connection;
    } catch (err) {
      lastError = err;
      const message = createDnsHelpMessage(uri, err);
      const baseError = String(err?.message || err);

      console.error(`MongoDB attempt ${attempt} failed: ${message}`);
      console.error(`MongoDB error detail: ${baseError}`);

      if (String(err?.message || "").toLowerCase().includes("bad auth")) {
        console.error("MongoDB authentication failed. Check Atlas username, password, and URL encoding.");
      }

      try {
        await mongoose.disconnect();
      } catch {
        // Ignore disconnect failures between retries.
      }

      if (attempt === MAX_CONNECT_ATTEMPTS) {
        break;
      }

      const retryDelay = Math.min(INITIAL_RETRY_DELAY_MS * (2 ** (attempt - 1)), MAX_RETRY_DELAY_MS);
      console.log(`Retrying MongoDB in ${retryDelay}ms`);
      await wait(retryDelay);
    }
  }

  throw lastError;
}

async function connectDB(mongoUri) {
  const envUri = (process.env.MONGO_URI || process.env.MONGODB_URI || "").trim();
  const candidates = buildConnectionCandidates(mongoUri);

  if (!mongoUri && !envUri) {
    console.warn(`MONGO_URI not set; defaulting to ${DEFAULT_URI}`);
  }

  mongoose.set("strictQuery", true);

  let lastError = null;

  for (const uri of candidates) {
    if (uri.includes("<") || uri.includes(">")) {
      throw new Error("MONGO_URI still contains placeholder values. Paste your real MongoDB Atlas standard mongodb:// connection string into .env.");
    }

    assertEncodedCredentials(uri);

    const validationErrors = validateMongoUri(uri);
    if (validationErrors.length > 0) {
      throw new Error(`Invalid MONGO_URI: ${validationErrors.join("; ")}`);
    }

    try {
      return await connectWithRetry(uri);
    } catch (err) {
      lastError = err;
      const hasMoreCandidates = candidates[candidates.length - 1] !== uri;

      if (!hasMoreCandidates) {
        throw err;
      }
    }
  }

  throw lastError;
}

module.exports = connectDB;
