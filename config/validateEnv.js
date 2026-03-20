/**
 * Environment Variable Validation Module
 * Validates all required environment variables on application startup
 */

require("./loadEnv");

const REQUIRED_VARS = [
  { key: "MONGO_URI", required: true },
  { key: "REDIS_URL", required: false },
  { key: "FIREBASE_SERVICE_ACCOUNT", required: false },
];

const VALIDATION_RULES = {
  MONGO_URI: {
    pattern: /^mongodb\+srv?:\/\//,
    message: "Must be a valid MongoDB connection string (mongodb:// or mongodb+srv://)",
  },
  REDIS_URL: {
    pattern: /^rediss?:\/\//,
    message: "Must be a valid Redis connection string (redis:// or rediss://)",
  },
};

/**
 * Check if a Redis hostname is likely incomplete (internal Render name)
 */
function isIncompleteRedisHost(url) {
  try {
    const parsed = new URL(url);
    // Render internal names look like "red-xxxxx" without domain
    return parsed.hostname && /^red-[a-z0-9]+$/.test(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Get suggested fix for Redis URL issues
 */
function getRedisUrlSuggestion(url) {
  const suggestions = [];

  if (isIncompleteRedisHost(url)) {
    suggestions.push("The hostname looks like an internal Render service name.");
    suggestions.push("Options to fix:");
    suggestions.push("  1. Use the external Redis URL from your Render dashboard");
    suggestions.push("  2. Add the full domain: red-xxxxx.internal or red-xxxxx.render.com");
    suggestions.push("  3. If on Render, ensure your services are in the same private network");
  }

  if (!url.includes(":")) {
    suggestions.push("Missing port. Default is 6379.");
  }

  return suggestions;
}

/**
 * Validate a single environment variable
 */
function validateVar(config) {
  const { key, required } = config;
  const value = process.env[key];
  const errors = [];
  const warnings = [];

  // Check if required
  if (required && !value) {
    errors.push(`${key} is required but not set`);
    return { key, valid: false, errors, warnings };
  }

  // If not set and not required, skip validation
  if (!value) {
    return { key, valid: true, errors, warnings, skipped: true };
  }

  // Apply pattern validation
  const rule = VALIDATION_RULES[key];
  if (rule && !rule.pattern.test(value)) {
    errors.push(`${key} format invalid: ${rule.message}`);
  }

  // Specific Redis URL validation
  if (key === "REDIS_URL") {
    if (isIncompleteRedisHost(value)) {
      warnings.push(`${key} appears to have an incomplete hostname`);
      warnings.push(...getRedisUrlSuggestion(value));
    }

    // Check for common mistakes
    if (value.includes("localhost") && process.env.NODE_ENV === "production") {
      warnings.push(`${key} points to localhost in production environment`);
    }
  }

  return {
    key,
    valid: errors.length === 0,
    errors,
    warnings,
    value: value ? `${value.substring(0, 20)}...` : null,
  };
}

/**
 * Run full environment validation
 */
function validateEnv() {
  console.log("🔍 Validating environment variables...\n");

  const results = REQUIRED_VARS.map(validateVar);
  let hasErrors = false;
  let hasWarnings = false;

  for (const result of results) {
    if (result.errors.length > 0) {
      hasErrors = true;
      console.error(`❌ ${result.key}`);
      result.errors.forEach((err) => console.error(`   - ${err}`));
    } else if (result.warnings.length > 0) {
      hasWarnings = true;
      console.warn(`⚠️  ${result.key}`);
      result.warnings.forEach((warn) => console.warn(`   - ${warn}`));
    } else if (!result.skipped) {
      console.log(`✅ ${result.key}`);
    }
  }

  console.log("");

  if (hasErrors) {
    console.error("❌ Environment validation failed!");
    console.error("Please fix the errors above before starting the application.\n");
    return { valid: false, hasErrors, hasWarnings };
  }

  if (hasWarnings) {
    console.warn("⚠️  Environment validation passed with warnings.\n");
  } else {
    console.log("✅ All environment variables validated successfully.\n");
  }

  return { valid: true, hasErrors, hasWarnings };
}

module.exports = {
  validateEnv,
  isIncompleteRedisHost,
  getRedisUrlSuggestion,
};