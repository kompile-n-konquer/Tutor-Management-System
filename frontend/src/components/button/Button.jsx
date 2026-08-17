const Button = ({ type = "button", onClick, disabled, loading, children }) => {
    return (
        <button
            type={type}
            disabled={disabled}
            onClick={onClick}
            className="w-full bg-primary-container text-on-primary rounded-DEFAULT px-4 py-3 font-label-caps text-label-caps uppercase hover:bg-primary hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {loading ? "Loading..." : children}
        </button>
    );
};

export default Button;