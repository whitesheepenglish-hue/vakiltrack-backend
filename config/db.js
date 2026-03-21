require("./loadEnv");

const mongoose = require("mongoose");

const DEFAULT_URI = "mongodb://127.0.0.1:27017/vakiltrack";
const DEFAULT_DB_NAME = "vakiltrack";

const assertEncodedCredentials = (uri) => {
  const value = String(uri || "").trim();

  if (!value.startsWith("mongodb://") && !value.startsWith("mongodb+srv://")) {
    return;
  }

  const withoutScheme = value.replace(/^mongodb(?:\+srv)?:\/\//, "");
  const authority = withoutScheme.split("/")[0] || "";

  // Multiple "@" signs in the authority almost always means the password
  // contains an unencoded "@" and the URI will be parsed incorrectly.
  if ((authority.match(/@/g) || []).length > 1) {
    throw new Error(
      "MONGO_URI contains an unencoded '@' in the username or password. URL-encode special characters, for example '@' -> '%40'."
    );
  }
};

const normalizeMongoUri = (value) => {
  const uri = String(value || "").trim();

  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    return uri;
  }

  try {
    const parsed = new URL(uri);
    const pathName = parsed.pathname.replace(/^\/+/, "");

    // Atlas connection strings often omit the DB name; default it so models
    // always land in the expected application database.
    if (!pathName) {
      parsed.pathname = `/${DEFAULT_DB_NAME}`;
    }

    return parsed.toString();
  } catch {
    return uri;
  }
};

const buildConnectionCandidates = (mongoUri) => {
  const candidates = [
    mongoUri,
    process.env.MONGO_URI,
    process.env.MONGODB_URI,
  ]
    .map((value) => normalizeMongoUri(value))
    .filter(Boolean);

  if (candidates.length === 0) {
    return [DEFAULT_URI];
  }

  return [...new Set(candidates)];
};

const connectDB = async (mongoUri) => {
  const envUri = (process.env.MONGO_URI || process.env.MONGODB_URI || "").trim();
  const candidates = buildConnectionCandidates(mongoUri);

  if (!mongoUri && !envUri) {
    console.warn(`MONGO_URI not set; defaulting to ${DEFAULT_URI}`);
  }

  mongoose.set("strictQuery", true);

  let lastError = null;

  for (const uri of candidates) {
    if (uri.includes("<") || uri.includes(">")) {
      throw new Error("MONGO_URI still contains placeholder values. Paste your real MongoDB Atlas connection string into .env.");
    }

    assertEncodedCredentials(uri);

    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10_000,
        serverApi: {
          version: mongoose.mongo.ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        },
      });

      await mongoose.connection.db.admin().command({ ping: 1 });
      console.log("MongoDB connected");
      return mongoose.connection;
    } catch (err) {
      lastError = err;

      if (uri.startsWith("mongodb+srv://") && String(err?.syscall || "") === "querySrv") {
        err.message = `${err.message} (SRV DNS lookup failed; try a non-SRV MongoDB connection string in MONGO_URI or MONGODB_URI)`;
      }
      if (String(err?.message || "").includes("bad auth")) {
        err.message = `${err.message} (check your Atlas username, password, and whether the password needs URL encoding)`;
      }

      const hasMoreCandidates = candidates[candidates.length - 1] !== uri;
      if (!hasMoreCandidates) {
        throw err;
      }

      try {
        await mongoose.disconnect();
      } catch {
        // Ignore disconnect failures between candidate attempts.
      }
    }
  }

  throw lastError;
};

module.exports = connectDB;
