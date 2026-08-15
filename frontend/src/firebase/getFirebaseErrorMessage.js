// TODO: Map Firebase error codes to appropriate messages for a great user experience
const firebaseErrorMessages = {
    // Sign up
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Your password is too weak. Please choose a stronger password.',

    // Sign in
    'auth/invalid-credential': 'The email or password you entered is incorrect.',
    'auth/user-not-found': 'No account was found with this email address.',
    'auth/wrong-password': 'The email or password you entered is incorrect.',
    'auth/user-disabled': 'This account has been disabled. Please contact support.',

    // General authentication
    'auth/too-many-requests': 'Too many attempts were made. Please try again later.',
    'auth/operation-not-allowed': 'This sign-in method is currently unavailable.',
    'auth/network-request-failed': 'A network error occurred. Please check your internet connection.',
    'auth/internal-error': 'Something went wrong. Please try again later.',
    'auth/invalid-api-key': "There is a problem with the application's configuration.",

    // Password / account management
    'auth/requires-recent-login': 'Please sign in again before performing this action.',
    'auth/credential-already-in-use': 'This account is already associated with another user.',
    'auth/account-exists-with-different-credential':
        'An account already exists with this email using a different sign-in method.',

    // Email verification / password reset
    'auth/expired-action-code': 'This link has expired. Please request a new one.',
    'auth/invalid-action-code': 'This link is invalid or has already been used.',
};

export default firebaseErrorMessages;
