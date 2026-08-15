import { Outlet } from 'react-router-dom';

// This component handles all tasks that are related to the '/' route such as:
// Checking whether the user is authenticated or not and redirecting them to the home page if they are (TODO)

const RootLayout = () => {
    return (
        <main>
            <Outlet />
        </main>
    );
};

export default RootLayout;
