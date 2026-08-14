import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// This configuration file is provided by firebase on the console
const firebaseConfig = {
    apiKey: 'Your Api Key',
    authDomain: 'project-id.firebaseapp.com',
    projectId: 'Your Project Id',
    storageBucket: 'project-id.firebasestorage.app',
    messagingSenderId: 'Your Messaging Sender Id',
    appId: 'App ID',
    measurementId: 'Measurement ID',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { app, auth };
