/**
 * Environment Variable Validation Module
 * Validates connection settings before the app starts accepting traffic.
 */

require("./loadEnv");

const REQUIRED_VARS = [
  { key: "MONGO_URI", required: true },
  { key: "REDIS_URL", required: false },
  { key: "FIREBASE_SERVICE_ACCOUNT", required: false },
];

const VALIDATION_RULES = {
  MONGO_URI: {
    message: "Must be a valid MongoDB connection string (mongodb:// or mongodb+srv://)",
  },
  REDIS_URL: {
    message: "Must be a valid Redis connection string (redis:// or rediss://)",
  },
};

function redactUrl(value) {
  if (!value) {
    return "";
  }

  if (/^mongodb:\/\//.test(value)) {
    return String(value).replace(/(mongodb:\/\/)([^:\/@]+)(?::[^@]*)?@/, "$1****:****@");
  }

  if (/^mongodb\+srv:\/\//.test(value)) {
    return String(value).replace(/(mongodb\+srv:\/\/)([^:\/@]+)(?::[^@]*)?@/, "$1****:****@");
  }

  try {
    const parsed = new URL(value);
    const hasPassword = parsed.password.length > 0;
    const hasUsername = parsed.username.length > 0;

    if (hasPassword) {
      parsed.password = "****";
    }

    if (hasUsername && !hasPassword) {
      parsed.username = "****";
    }

    return parsed.toString();
  } catch {
    return String(value).replace(/\/\/([^:\/@]+)(?::[^@]*)?@/, "//****:****@");
  }
}

function validateMongoUri(value) {
  const errors = [];

  if (!/^mongodb(?:\+srv)?:\/\//.test(value)) {
    errors.push(VALIDATION_RULES.MONGO_URI.message);
    return errors;
  }

  try {
    const withoutScheme = value.replace(/^mongodb(?:\+srv)?:\/\//, "");
    const authorityAndPath = withoutScheme.split("/")[0] || "";
    const authority = authorityAndPath.split("?")[0] || "";
    const hostsSegment = authority.includes("@")
      ? authority.slice(authority.lastIndexOf("@") + 1)
      : authority;
    const hosts = hostsSegment.split(",").map((host) => host.trim()).filter(Boolean);

    if (hosts.length === 0) {
      errors.push("MONGO_URI must include at least one hostname");
    }

    for (const host of hosts) {
      const normalizedHost = host.startsWith("[") ? host : host.split(":")[0];
      if (!normalizedHost) {
        errors.push("MONGO_URI contains an empty hostname");
      }
    }
  } catch (error) {
    errors.push(`MONGO_URI could not be parsed: ${error.message}`);
  }

  return errors;
}

function validateRedisUri(value) {
  const errors = [];
  const warnings = [];

  if (!/^rediss?:\/\//.test(value)) {
    errors.push(VALIDATION_RULES.REDIS_URL.message);
    return { errors, warnings };
  }

  try {
    const parsed = new URL(value);

    if (!parsed.hostname) {
      errors.push("REDIS_URL must include a hostname");
    }

    if (parsed.protocol === "rediss:" && parsed.port && parsed.port !== "6379") {
      warnings.push("REDIS_URL uses TLS with a non-default port; verify this matches your provider settings");
    }

    if (parsed.hostname && /^red-[a-z0-9]+$/.test(parsed.hostname)) {
      warnings.push("REDIS_URL hostname looks like an internal Render service name");
      warnings.push("Use the external Render Redis URL unless your services share a private network");
    }

    if (parsed.hostname === "localhost" && process.env.NODE_ENV === "production") {
      warnings.push("REDIS_URL points to localhost in production");
    }
  } catch (error) {
    errors.push(`REDIS_URL could not be parsed: ${error.message}`);
  }

  return { errors, warnings };
}

function validateVar(config) {
  const { key, required } = config;
  const value = String(process.env[key] || "").trim();
  const errors = [];
  const warnings = [];

  if (required && !value) {
    errors.push(`${key} is required but not set`);
    return { key, valid: false, errors, warnings };
  }

  if (!value) {
    return { key, valid: true, errors, warnings, skipped: true };
  }

  if (key === "MONGO_URI") {
    errors.push(...validateMongoUri(value));
  }

  if (key === "REDIS_URL") {
    const redisValidation = validateRedisUri(value);
    errors.push(...redisValidation.errors);
    warnings.push(...redisValidation.warnings);
  }

  return {
    key,
    valid: errors.length === 0,
    errors,
    warnings,
    sanitizedValue: redactUrl(value),
  };
}

function validateEnv() {
  console.log("Validating environment variables...");

  const results = REQUIRED_VARS.map(validateVar);
  const errorMessages = [];

  for (const result of results) {
    if (result.skipped) {
      continue;
    }

    if (result.valid) {
      console.log(`${result.key}: ${result.sanitizedValue}`);
    }

    for (const warning of result.warnings) {
      console.warn(`${result.key} warning: ${warning}`);
    }

    for (const error of result.errors) {
      errorMessages.push(`${result.key}: ${error}`);
    }
  }

  if (errorMessages.length > 0) {
    throw new Error(`Environment validation failed:\n${errorMessages.join("\n")}`);
  }

  return { valid: true };
}

module.exports = {
  redactUrl,
  validateEnv,
  validateMongoUri,
  validateRedisUri,
};
