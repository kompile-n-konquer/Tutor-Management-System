const ErrorMessage = ({ children }) => {
    return (
        <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-error-container bg-error-container/40 px-3 py-2.5 font-body-sm text-body-sm text-on-error-container"
        >
            <span className="material-symbols-outlined text-[18px] mt-px" aria-hidden="true">
                error
            </span>
            <span>{children}</span>
        </p>
    );
};

export default ErrorMessage;
