import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RootLayout from './RootLayout.jsx';

describe('RootLayout — top-level layout outlet', () => {
  test('renders the matched child route inside a <main> element', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RootLayout />}>
            <Route index element={<div>home-page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('home-page')).toBeInTheDocument();
    expect(container.querySelector('main')).toBeInTheDocument();
  });
});
