import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Footer from './Footer';

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('Footer Component', () => {
  beforeEach(() => {
    renderWithRouter(<Footer />);
  });

  test('renders company name', () => {
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByText('Nepa')).toBeInTheDocument();
  });

  test('renders all footer sections', () => {
    expect(screen.getByText('Product')).toBeInTheDocument();
    expect(screen.getByText('Company')).toBeInTheDocument();
    expect(screen.getByText('Resources')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();
  });

  test('renders footer links', () => {
    expect(screen.getByText('Features')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Help Center')).toBeInTheDocument();
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
  });

  test('renders social media links', () => {
    const socialLinks = screen.getAllByRole('link').filter(link => 
      ['Twitter', 'GitHub', 'LinkedIn', 'Discord'].some(social => 
        link.getAttribute('aria-label') === social
      )
    );
    
    expect(socialLinks).toHaveLength(4);
  });

  test('social media links open in new tab', () => {
    const twitterLink = screen.getByLabelText('Twitter');
    expect(twitterLink).toHaveAttribute('target', '_blank');
    expect(twitterLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('renders copyright with current year', () => {
    const currentYear = new Date().getFullYear();
    expect(screen.getByText(`© ${currentYear} Nepa. All rights reserved.`)).toBeInTheDocument();
  });

  test('internal links use React Router', () => {
    const featuresLink = screen.getByText('Features');
    expect(featuresLink.closest('a')).toHaveAttribute('href', '/features');
  });

  test('has proper accessibility attributes', () => {
    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeInTheDocument();
    
    const socialLinks = screen.getAllByRole('link').filter(link => 
      link.getAttribute('aria-label')
    );
    expect(socialLinks.length).toBeGreaterThan(0);
  });

  test('renders bottom navigation links', () => {
    expect(screen.getByText('Accessibility')).toBeInTheDocument();
    expect(screen.getByText('Sitemap')).toBeInTheDocument();
    expect(screen.getByText('RSS Feed')).toBeInTheDocument();
  });

  test('has responsive classes', () => {
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveClass('bg-gray-900', 'text-white');
  });
});
