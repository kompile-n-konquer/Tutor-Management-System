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
  test('renders the hero headline and trust badges', () => {
    renderHome();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/tutoring made/i);
    expect(screen.getByText('Automated Allocation')).toBeInTheDocument();
    expect(screen.getByText('Instant Timesheets')).toBeInTheDocument();
    expect(screen.getByText('CSAM Verified')).toBeInTheDocument();
  });

  test('renders the feature cards for the platform pillars', () => {
    renderHome();

    expect(screen.getByText('Features Built for CSAM')).toBeInTheDocument();
    expect(screen.getByText('Allocation Board')).toBeInTheDocument();
    expect(screen.getByText('Digital Timesheets')).toBeInTheDocument();
    expect(screen.getByText('Tutor Intake Portal')).toBeInTheDocument();
  });

  test('renders the benefits, commitment banner and the footer', () => {
    renderHome();

    expect(screen.getByText('Why Use Tutor Flow')).toBeInTheDocument();
    expect(screen.getByText('One board, every allocation')).toBeInTheDocument();
    expect(screen.getByText('Commitment to Excellence')).toBeInTheDocument();
    expect(screen.getByText('Learn more about CSAM')).toBeInTheDocument();
    expect(screen.getByText(/© 2026 School of Computer Science/i)).toBeInTheDocument();
  });
});
