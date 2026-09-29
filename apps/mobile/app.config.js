/**
 * Dynamic Expo config layered over app.json.
 *
 * Android cleartext (http://) traffic is allowed ONLY when the configured API
 * is plain http (local development against `pnpm dev:api`). Release builds
 * point EXPO_PUBLIC_API_BASE_URL at an https API and keep Android's default
 * of blocking cleartext traffic.
 */
module.exports = ({ config }) => {
  const apiUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:5000';
  const cleartext = apiUrl.startsWith('http://');
  return {
    ...config,
    android: { ...config.android, usesCleartextTraffic: cleartext },
  };
};
