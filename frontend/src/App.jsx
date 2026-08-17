import { useNavigate } from 'react-router-dom';
import Button from './components/button/Button.jsx';
import './App.css';

// This component is used as a landing page
const App = () => {
    const navigate = useNavigate();
    return (
        <section>
            <h1>Hello from TutorFlow!</h1>
            <Button onClick={() => navigate('/login')}>Login</Button>
            <Button onClick={() => navigate('/signup')}>Signup</Button>
        </section>
    );
};

export default App;
