import { createBrowserRouter } from 'react-router-dom';
import RootLayout from './RootLayout.jsx';
import Home from './features/home/Home.jsx';
import Signup from './features/auth/signup/Signup.jsx';
import App from './App.jsx';
import Login from './features/auth/login/Login.jsx';
import ConfirmationMessage from './features/auth/confirmation-message/ConfirmationMessage.jsx';
import ForgotPassword from './features/auth/forgot-password/ForgotPassword.jsx';

// TODO: Create an error element for the default route
const router = createBrowserRouter([
    {
        path: '/',
        element: <RootLayout />,
        errorElement: <h1>An error occurred...</h1>,
        children: [
            { index: true, element: <App /> },
            { path: 'home', element: <Home /> },
            { path: 'signup', element: <Signup /> },
            { path: 'login', element: <Login /> },
            { path: 'forgot-password', element: <ForgotPassword /> },
            { path: 'confirmation-message', element: <ConfirmationMessage /> },
        ],
    },
]);

export default router;
