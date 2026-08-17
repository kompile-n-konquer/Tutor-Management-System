const AuthQuestion = ({ onClick, linkText, children }) => {
    return (
        <section>
            <p>{children}</p>
            <a onClick={onClick}>{linkText}</a>
        </section>
    );
};

export default AuthQuestion;
