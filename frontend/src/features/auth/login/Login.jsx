import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import useAsync from '../../../hooks/useAsync.js';

import Input from '../../../components/Input/Input.jsx';
import isValidEmail from '../../../utils/validEmail.js';
import ErrorMessage from '../../../components/error-message/ErrorMessage.jsx';
import Button from '../../../components/button/Button.jsx';
import AuthQuestion from '../auth-question/AuthQuestion.jsx';
import AuthForm from '../auth-form/AuthForm.jsx';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth } from '../../../firebase/firebase.js';
import provider from '../../../firebase/googleProvider.js';

const Login = () => {
    const navigate = useNavigate();
    const { setError, execute, isLoading, error } = useAsync();
    const [data, setData] = useState({ email: '', password: '' });

    const handleLogin = async (event) => {
        event.preventDefault();
        setError('');
        const response = await execute(() => signInWithEmailAndPassword(auth, data.email, data.password));
        if (response) navigate('/home');
    };

    const handleLoginWithGoogle = async (event) => {
        event.preventDefault();
        const response = await signInWithPopup(auth, provider);
        if (response) navigate('/home');
    };

    const handleChange = (event, name) => {
        setError('');

        setData((prevData) => {
            const newData = { ...prevData };
            newData[name] = event.target.value;
            return newData;
        });
    };

    let disableBtn = false; // Used to disable the submit button when one of the fields is empty
    if (!data.password || !data.email || !isValidEmail(data.email)) {
        disableBtn = true;
    }

    const fields = [
        {
            id: 'email',
            type: 'email',
            value: data.email,
            placeholder: 'example@testmaker.com',
            labelText: 'Email',
            onChange: (e) => handleChange(e, 'email'),
        },
        {
            id: 'password',
            type: 'password',
            value: data.password,
            placeholder: 'Enter your password',
            labelText: 'Password',
            onChange: (e) => handleChange(e, 'password'),
        },
    ];

    const description = 'Please fill in your details below to access your account';

    return (
        <>
            <AuthForm heading="Welcome Back" description={description}>
                {fields.map((field) => (
                    <Input key={field.id} {...field} />
                ))}
                {error && <ErrorMessage>{error}</ErrorMessage>}
                <Button disabled={disableBtn} loading={isLoading} onClick={(e) => handleLogin(e)}>
                    Login
                </Button>
            </AuthForm>
            <a onClick={() => navigate('/forgot-password')}>Forgot Password</a>
            <AuthQuestion onClick={() => navigate('/signup')} linkText="Signup">
                Don't have an account?
            </AuthQuestion>
            <Button onClick={handleLoginWithGoogle}>Login with google</Button>
        </>
    );
};

export default Login;
