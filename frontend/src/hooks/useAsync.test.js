import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { FirebaseError } from 'firebase/app';
import useAsync from './useAsync.js';
import firebaseErrorMessages from '../firebase/getFirebaseErrorMessage.js';

describe('useAsync — async operation state hook', () => {
  test('returns the resolved value and clears loading state', async () => {
    const { result } = renderHook(() => useAsync());

    let outcome;
    await act(async () => {
      outcome = await result.current.execute(() => Promise.resolve('signed in'));
    });

    expect(outcome).toBe('signed in');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe('');
  });

  test('exposes isLoading while the operation is in flight', async () => {
    const { result } = renderHook(() => useAsync());

    let resolveOperation;
    const pending = new Promise((resolve) => {
      resolveOperation = resolve;
    });

    await act(async () => {
      result.current.execute(() => pending);
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveOperation('done');
    });
    expect(result.current.isLoading).toBe(false);
  });

  test('maps FirebaseError codes to friendly messages', async () => {
    const { result } = renderHook(() => useAsync());

    let outcome;
    await act(async () => {
      outcome = await result.current.execute(() =>
        Promise.reject(new FirebaseError('auth/invalid-credential', 'raw message')),
      );
    });

    expect(outcome).toBeUndefined();
    expect(result.current.error).toBe(firebaseErrorMessages['auth/invalid-credential']);
    expect(result.current.isLoading).toBe(false);
  });

  test('falls back to a generic message for non-Firebase errors', async () => {
    const { result } = renderHook(() => useAsync());

    await act(async () => {
      await result.current.execute(() => Promise.reject(new Error('Network down')));
    });

    expect(result.current.error).toBe('Something went wrong! Please try again later');
  });

  test('exposes setError so callers can clear or set the message', async () => {
    const { result } = renderHook(() => useAsync());

    await act(async () => {
      result.current.setError('Please enter a valid email address.');
    });
    expect(result.current.error).toBe('Please enter a valid email address.');
  });
});
