import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import useAsync from '../../../hooks/useAsync.js';

import Input from '../../../components/Input/Input.jsx';
import isValidEmail from '../../../utils/validEmail.js';
import ErrorMessage from '../../../components/error-message/ErrorMessage.jsx';
import Button from '../../../components/button/Button.jsx';
import AuthQuestion from '../auth-question/AuthQuestion.jsx';
import AuthForm from '../auth-form/AuthForm.jsx';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../../firebase/firebase.js';

const ForgotPassword = () => {
    const navigate = useNavigate();
    const { setError, execute, isLoading, error } = useAsync();
    const [email, setEmail] = useState('');

    const handleForgotPassword = async (event) => {
        event.preventDefault();
        setError('');
        const response = await execute(() => sendPasswordResetEmail(auth, email));
        if (response) navigate('/confirmation-message');
    };

    const handleChange = (event) => {
        setError('');
        setEmail(event.target.value);
    };

    let disableBtn = false; // Used to disable the submit button when one of the fields is empty
    if (!email || !isValidEmail(email)) {
        disableBtn = true;
    }

    const fields = [
        {
            id: 'email',
            type: 'email',
            value: email,
            placeholder: 'example@testmaker.com',
            labelText: 'Email',
            onChange: handleChange,
        },
    ];

    const description = "Don't worry, enter your email below to reset your password.";

    return (
        <>
            <AuthForm heading="Forgot your password?" description={description}>
                {fields.map((field) => (
                    <Input key={field.id} {...field} />
                ))}
                {error && <ErrorMessage>{error}</ErrorMessage>}
                <Button disabled={disableBtn} loading={isLoading} onClick={handleForgotPassword}>
                    Submit
                </Button>
            </AuthForm>
            <AuthQuestion onClick={() => navigate('/login')} linkText="Login">
                Remember password?
            </AuthQuestion>
        </>
    );
};

export default ForgotPassword;
