import { FirebaseError } from 'firebase/app';
import { useCallback, useState } from 'react';
import firebaseErrorMessages from '../firebase/getFirebaseErrorMessage.js';

// This is a generic custom hook that reduces common concerns that often come with async operations that make api calls
const useAsync = () => {
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // useCallback keeps the same function reference across renders.
    // Without it, useEffects that depend on execute re-run on every render and loop infinitely.
    // The deps array is empty because the function only uses state setters, which never change.
    const execute = useCallback(async (operation) => {
        setIsLoading(true);
        setError('');

        try {
            return await operation();
        } catch (error) {
            if (error instanceof FirebaseError) {
                return setError(firebaseErrorMessages[error.code]);
            }

            // This hook is used to perform firebase operations for now hence there is no further error handling
            setError('Something went wrong! Please try again later');
        } finally {
            setIsLoading(false);
        }
    }, []);

    return { setError, execute, error, isLoading };
};

export default useAsync;
