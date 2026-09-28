/** Jest (jest-expo) for the mobile app: unit, component and architecture tests. */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  // pnpm keeps packages under node_modules/.pnpm/<name>@<version>/node_modules/<name>:
  // transform React Native / Expo sources and the workspace packages' ESM output.
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm|react-native|@react-native|@react-native-community|expo|@expo|expo-.*|@expo-google-fonts|react-navigation|@react-navigation|@crm|@tanstack|react-native-.*|nativewind|react-native-css-interop))',
    'node_modules/\\.pnpm/(?!(react-native|@react-native|@react-native-community|expo|@expo|expo-|react-navigation|@react-navigation|@tanstack|react-native-|nativewind|react-native-css-interop|@crm))',
  ],
  moduleNameMapper: {
    '^@crm/(api-client|types|validation|permissions)$': '<rootDir>/../../packages/$1/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
