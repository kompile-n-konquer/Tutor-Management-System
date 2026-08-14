// This component is shown to the user as a confirmation that a password reset email has been sent to their email
const ConfirmationMessage = () => {
    return (
        <section>
            <h1>Email Confirmation</h1>
            <p>
                If a user with the email exists in our records then an email has been sent. Please check your emails to
                continue resetting the password
            </p>
        </section>
    );
};

export default ConfirmationMessage;
