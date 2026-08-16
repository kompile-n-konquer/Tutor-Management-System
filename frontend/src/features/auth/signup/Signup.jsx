import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import useAsync from '../../../hooks/useAsync.js';

import Input from '../../../components/Input/Input.jsx';
import isValidEmail from '../../../utils/validEmail.js';
import ErrorMessage from '../../../components/error-message/ErrorMessage.jsx';
import Button from '../../../components/button/Button.jsx';
import AuthQuestion from '../auth-question/AuthQuestion.jsx';
import AuthForm from '../auth-form/AuthForm.jsx';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../../firebase/firebase.js';
import api from '../../../utils/axiosInstance.js';

const Signup = () => {
  const navigate = useNavigate();
  const { setError, execute, isLoading, error } = useAsync();
  const [data, setData] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' });

  const handleSignup = async (event) => {
    event.preventDefault();
    setError('');

    const firebaseResponse = await execute(() => createUserWithEmailAndPassword(auth, data.email, data.password));

    const extraData = { firstName: data.firstName, lastName: data.lastName, email: data.email };
    const apiResponse = await execute(() => api.post('/users', extraData));

    if (apiResponse.status === 201) {
      navigate('/home');
    }
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
  if (
    !data.firstName ||
    !data.lastName ||
    !data.password ||
    !data.email ||
    !data.confirmPassword ||
    !isValidEmail(data.email)
  ) {
    disableBtn = true;
  }

  const fields = [
    {
      id: 'firstname',
      type: 'text',
      value: data.firstName,
      placeholder: 'Enter your first name',
      labelText: 'First Name',
      onChange: (e) => handleChange(e, 'firstName'),
    },
    {
      id: 'lastname',
      type: 'text',
      value: data.lastName,
      placeholder: 'Enter your last name',
      labelText: 'Last Name',
      onChange: (e) => handleChange(e, 'lastName'),
    },
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
    {
      id: 'confirm-password',
      type: 'password',
      value: data.confirmPassword,
      placeholder: 'Confirm your password',
      labelText: 'Confirm Password',
      onChange: (e) => handleChange(e, 'confirmPassword'),
    },
  ];

  const description = 'Please fill in your details below to create an account with us';

  return (
    <>
      <AuthForm heading="Get Started" description={description}>
        {fields.map((field) => (
          <Input key={field.id} {...field} />
        ))}
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <Button disabled={disableBtn} loading={isLoading} onClick={(e) => handleSignup(e)}>
          Create Account
        </Button>
      </AuthForm>
      <AuthQuestion onClick={() => navigate('/login')} linkText="Login">
        Already have an account?
      </AuthQuestion>
    </>
  );
};

export default Signup;
