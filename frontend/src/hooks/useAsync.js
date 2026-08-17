import { FirebaseError } from 'firebase/app';
import { useState } from 'react';
import firebaseErrorMessages from '../firebase/getFirebaseErrorMessage.js';

// This is a generic custom hook that reduces common concerns that often come with async operations that make api calls
const useAsync = () => {
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const execute = async (operation) => {
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
    };

    return { setError, execute, error, isLoading };
};

export default useAsync;
