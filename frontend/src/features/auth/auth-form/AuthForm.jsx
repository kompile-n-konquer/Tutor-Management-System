const AuthForm = ({ heading, description, children }) => {
    return (
        <div id="form">
            <h1>TutorFlow</h1>
            <h2>{heading}</h2>
            <p>{description}</p>
            <form>{children}</form>
        </div>
    );
};

export default AuthForm;
