
import { configureStore } from '@reduxjs/toolkit';
import notesReducer from './slices/notesSlice';

export const makeStore = () => {
  return configureStore({
    reducer: {
      notes: notesReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
        },
      }),
  });
};

// Create the store
export const store = makeStore();
