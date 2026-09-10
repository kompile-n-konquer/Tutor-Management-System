import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home.jsx';

const renderHome = () =>
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );

describe('Home — public landing page', () => {
  test('renders the hero with links into the portal', () => {
    renderHome();

    expect(screen.getByText('Empowering Academic Excellence at CSAM')).toBeInTheDocument();
    expect(screen.getAllByText('Sign Up')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /enter portal/i })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: 'Sign Up' })).toHaveAttribute('href', '/signup');
  });

  test('renders the feature cards for each role', () => {
    renderHome();

    expect(screen.getByText('Seamless Allocation')).toBeInTheDocument();
    expect(screen.getByText('Your Schedule, Simplified')).toBeInTheDocument();
    expect(screen.getByText('Volunteer & Grow')).toBeInTheDocument();
  });

  test('renders the benefits banner and the footer', () => {
    renderHome();

    expect(screen.getByText('Commitment to Excellence')).toBeInTheDocument();
    expect(screen.getByText('Learn more about CSAM')).toBeInTheDocument();
    expect(screen.getByText(/© 2024 School of Computer Science/i)).toBeInTheDocument();
  });
});
