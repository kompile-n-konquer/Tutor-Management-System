import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase/firebase.js';
import Button from '../../components/button/Button.jsx';
import { deleteUser } from 'firebase/auth';

const Home = () => {
    const navigate = useNavigate();

    const handleDeleteAccount = async () => {
        const user = auth.currentUser;
        const response = await deleteUser(user);
        navigate('/login');
    };

    return (
        <section>
            <h1>Home Page</h1>
            <Button onClick={handleDeleteAccount}>Delete Account</Button>
        </section>
    );
};

export default Home;
