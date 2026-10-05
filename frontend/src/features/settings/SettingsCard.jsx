// Shared card chrome for configuration/settings sections. Every setting lives
// in one of these cards, so new sections are added by dropping another
// <SettingsCard> into the page's stack.
const SettingsCard = ({ title, description, className = "", children }) => (
  <div
    className={`bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento ${className}`}
  >
    <div className="mb-stack-md pb-stack-sm border-b border-outline-variant/30">
      <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
        {title}
      </h3>
      <p className="font-body-sm text-outline mt-1">{description}</p>
    </div>
    {children}
  </div>
);

export default SettingsCard;
