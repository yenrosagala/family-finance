const config = {
  // The Express API server URL the app talks to.
  // When running on a physical device, replace localhost with your LAN IP.
  apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000',
};

export default config;
