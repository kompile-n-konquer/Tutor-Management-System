import { useState } from 'react';

interface ToggleButtonProps {
  /** Label shown when the button is in the "off" state */
  offLabel?: string;
  /** Label shown when the button is in the "on" state */
  onLabel?: string;
  /** Callback fired each time the state toggles */
  onToggle?: (isActive: boolean) => void;
}

/**
 * A button that toggles between an active and inactive state.
 * Displays different text and a data-active attribute depending on state.
 */
export default function ToggleButton({
  offLabel = 'Activate',
  onLabel = 'Deactivate',
  onToggle,
}: ToggleButtonProps) {
  const [isActive, setIsActive] = useState(false);

  const handleClick = () => {
    const next = !isActive;
    setIsActive(next);
    onToggle?.(next);
  };

  return (
    <button
      data-active={isActive}
      onClick={handleClick}
      style={{
        padding: '8px 16px',
        backgroundColor: isActive ? '#22c55e' : '#ef4444',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
      }}
    >
      {isActive ? onLabel : offLabel}
    </button>
  );
}
