const Input = ({ onChange, type, placeholder, value, labelText }) => {
    const label = labelText ? labelText.toLowerCase() : undefined;
    return (
        <section>
            <label htmlFor={label}>{labelText}</label>
            <input value={value} id={label} type={type} placeholder={placeholder} onChange={onChange} />
        </section>
    );
};

export default Input;
