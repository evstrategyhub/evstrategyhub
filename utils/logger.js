export function logInfo(message) {
  console.log(`[INFO] [${new Date().toISOString()}] ${message}`);
}

export function logError(message, error) {
  console.error(`[ERROR] [${new Date().toISOString()}] ${message}`, error);
}

export function logSuccess(message) {
  console.log(`[SUCCESS] [${new Date().toISOString()}] ${message}`);
}