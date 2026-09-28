/**
 * Native module mocks for Jest. SecureStore and AsyncStorage are in-memory so
 * tests can assert exactly what is (and is not) persisted.
 */
export const mockSecureStore = new Map<string, string>();
export const mockAsyncStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockAsyncStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockAsyncStore.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockAsyncStore.delete(key);
    }),
  },
}));

beforeEach(() => {
  mockSecureStore.clear();
  mockAsyncStore.clear();
});

// SafeAreaProvider renders nothing until native insets arrive; use the library's Jest mock.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// Drawer navigation: gesture handler and reanimated have no native side in Jest.
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
