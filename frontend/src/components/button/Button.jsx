const Button = ({ type = "button", disabled, loading, className = "", children, ...rest }) => {
    return (
        <button
            type={type}
            disabled={disabled || loading}
            className={`w-full cursor-pointer bg-primary-container text-on-primary rounded-lg px-4 py-3 font-label-caps text-label-caps uppercase hover:bg-primary hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
            {...rest}
        >
            {loading ? "Loading..." : children}
        </button>
    );
};

export default Button;