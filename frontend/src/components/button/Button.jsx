// The 'any' type is used on the onClick handler so that the component can be more reusable
// The naming of boolean props are without the normal 'is' to mimick the actual button element attributes
const Button = ({ onClick, disabled, loading, children }) => {
    return (
        <button disabled={disabled} onClick={onClick}>
            {loading ? 'Loading...' : children}
        </button>
    );
};

export default Button;
