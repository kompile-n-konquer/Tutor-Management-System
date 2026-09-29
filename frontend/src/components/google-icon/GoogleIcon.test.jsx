import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import GoogleIcon from './GoogleIcon.jsx';

describe('GoogleIcon — decorative Google logo', () => {
  test('renders the brand svg marked as decorative', () => {
    const { container } = render(<GoogleIcon />);

    const svg = container.querySelector('svg[aria-hidden="true"]');
    expect(svg).toBeInTheDocument();
    expect(svg.querySelectorAll('path')).toHaveLength(4);
  });
});
