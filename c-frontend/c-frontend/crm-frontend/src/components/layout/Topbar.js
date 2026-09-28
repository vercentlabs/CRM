/**
 * Refined Topbar component for the application header
 * Features enterprise design with improved search input and professional avatar
 */
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { getStoredTheme, setTheme } from '@/lib/theme';

// User silhouette icon for default avatar
const UserIcon = () => (
  <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
  </svg>
);

// Search icon
const SearchIcon = () => (
  <svg className="h-4 w-4 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const SunIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364-6.364-1.414 1.414M8.05 16.95l-1.414 1.414m0-11.314 1.414 1.414m8.486 8.486 1.414 1.414M12 7a5 5 0 100 10 5 5 0 000-10z" />
  </svg>
);

const MoonIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12.79A9 9 0 1111.21 3c.06 0 .12 0 .18.01a7 7 0 009.61 9.78z" />
  </svg>
);

const Topbar = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [theme, setThemeState] = useState(() => {
    if (typeof document === 'undefined') return 'light';
    return document.documentElement.dataset.theme || getStoredTheme() || 'light';
  });
  const searchInputRef = useRef(null);
  const profileMenuRef = useRef(null);
  const router = useRouter();

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleThemeChange = (event) => {
      const nextTheme = event.detail?.theme || document.documentElement.dataset.theme || 'light';
      setThemeState(nextTheme);
    };

    window.addEventListener('theme-change', handleThemeChange);

    return () => {
      window.removeEventListener('theme-change', handleThemeChange);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Open search with Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // Close profile menu with Escape
      if (e.key === 'Escape' && profileMenuOpen) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [profileMenuOpen]);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    setProfileMenuOpen(false);
  };

  const handleThemeToggle = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Navigate to search results page with query
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  return (
    <div className="relative z-10 shrink-0 flex h-16 bg-[var(--app-topbar)] border-b border-[var(--border)]">
      {/* Mobile menu button */}
      <button
        type="button"
        className="md:hidden px-4 text-indigo-600 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
        onClick={onMenuClick}
      >
        <span className="sr-only">Open sidebar</span>
        <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="flex-1 px-4 flex justify-between items-center">
        {/* Search bar with improved structure */}
        <div className="flex-1 min-w-0">
          <form onSubmit={handleSearchSubmit} autoComplete="off">
            <div className="relative">
              {/* Search icon positioned inside input container */}
              {/* <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <SearchIcon />
              </div> */}

              {/* Input with proper padding to avoid icon overlap */}
              <input
                ref={searchInputRef}
                className="block w-full h-10 pl-3 pr-8 py-2 border rounded sm:text-sm transition-all duration-150 sm:pl-10 sm:pr-12 bg-[var(--search-bg)] text-[var(--search-text)] border-[var(--search-border)]"
                placeholder="Search leads, customers, tasks…"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
              />

              {/* Keyboard shortcut badge */}
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                {/* <kbd className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-gray-400 bg-indigo-800 border border-indigo-600">
                  ⌘K
                </kbd> */}
              </div>
            </div>
          </form>
        </div>

        {/* User profile menu with professional avatar */}
        <div className="ml-4 flex items-center gap-3 md:ml-6">
          <button
            type="button"
            onClick={handleThemeToggle}
            className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--app-hover)] transition-colors"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              className="flex items-center justify-center h-10 w-10 rounded-full bg-indigo-600 border border-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--app-topbar)] focus:ring-indigo-500"
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            >
              <span className="sr-only">Open user menu</span>
              <UserIcon />
            </button>

            {/* Profile dropdown with smooth animation */}
            <div className={`origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-[var(--card)] ring-1 ring-black ring-opacity-5 divide-y divide-[var(--border)] focus:outline-none transition-all duration-150 ${
              profileMenuOpen ? 'opacity-100 transform scale-100' : 'opacity-0 transform scale-95 pointer-events-none'
            }`}>
              <div className="px-4 py-3">
                <p className="text-sm text-[var(--muted-foreground)]">Signed in as</p>
                <p className="text-sm font-medium text-[var(--foreground)] truncate">{user?.name || user?.email}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    router.push('/profile');
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--app-hover)]"
                >
                  Profile
                </button>
                <button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    router.push('/change-password');
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--app-hover)]"
                >
                  Change Password
                </button>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--app-hover)]"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Topbar;
