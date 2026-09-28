
'use client';

import React, { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const SettingsPage = () => {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const { token } = useAuth();

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await api.get('/settings');
        

        
        setSettings(response.data.settings || {});
      } catch (err) {
        console.error('Failed to fetch settings:', err);
        if (!error) {
          setError('Failed to load settings. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };
    
    if (token) {
      fetchSettings();
    }
  }, [token, error]);

  const handleSaveSettings = async (updatedSettings) => {
    try {
      setSaving(true);
      setSaveError(null);
      
      const response = await api.patch('/settings', updatedSettings);
      

      
      setSettings(response.data.settings || {});
      setSuccessMessage('Settings saved successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      if (!saveError) {
        setSaveError('Failed to save settings. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };
  return (
    <ProtectedRoute allowedRoles={[ROLE_ADMIN]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          {/* Page Header with Gradient Background */}
          <div className="mb-8">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-lg overflow-hidden">
              <div className="px-6 py-8 sm:px-8 sm:py-10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <div className="mb-6 sm:mb-0">
                    <h1 className="text-3xl sm:text-4xl font-bold text-white">
                      Settings
                    </h1>
                    <p className="mt-2 text-indigo-100 text-base sm:text-lg">
                      Configure system-wide settings and preferences
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {/* Refresh Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        if (token) {
                          api.get('/settings')
                            .then(response => setSettings(response.data.settings || {}))
                            .catch(err => {
                              console.error('Failed to fetch settings:', err);
                              if (!error) {
                                setError('Failed to load settings. Please try again.');
                              }
                            });
                        }
                      }}
                      className="inline-flex items-center px-4 py-2.5 border border-white/30 rounded-xl text-sm font-medium text-white bg-white/10 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white focus:ring-offset-indigo-600 transition-all duration-200 backdrop-blur-sm"
                    >
                      <svg className="mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {successMessage && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-md">
              {successMessage}
            </div>
          )}

          <div className="mt-8 bg-white shadow overflow-hidden sm:rounded-lg">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                  <p className="mt-2 text-sm text-gray-500">Loading settings...</p>
                </div>
              </div>
            ) : error ? (
              <div className="px-4 py-5 sm:p-6">
                <div className="bg-red-50 border-l-4 border-red-400 p-4">
                  <div className="flex">
                    <div className="shrink-0">
                      <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">
                        Error loading settings
                      </h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                      </div>
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            if (token) {
                              api.get('/settings')
                                .then(response => setSettings(response.data.settings || {}))
                                .catch(err => {
                                  console.error('Failed to fetch settings:', err);
                                  if (!error) {
                                    setError('Failed to load settings. Please try again.');
                                  }
                                });
                            }
                          }}
                          className="bg-red-50 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-5 sm:p-6">
                <div className="text-center mb-6">
                  <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
                  <p className="mt-2 text-gray-600">Your system settings will appear here.</p>
                </div>
                
                {saveError && (
                  <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">Error saving settings</h3>
                        <div className="mt-2 text-sm text-red-700">
                          <p>{saveError}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="space-y-6">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">System Configuration</h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">
                      Configure system-wide settings that affect all users.
                    </p>
                    
                    <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="company-name" className="block text-sm font-medium text-gray-700">Company Name</label>
                        <div className="mt-1">
                          <input
                            type="text"
                            id="company-name"
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                            defaultValue={settings.companyName || ''}
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label htmlFor="default-role" className="block text-sm font-medium text-gray-700">Default Role for New Users</label>
                        <div className="mt-1">
                          <select
                            id="default-role"
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                            defaultValue={settings.defaultRole || '3'}
                          >
                            <option value="1">Administrator</option>
                            <option value="2">Manager</option>
                            <option value="3">Sales Representative</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="px-4 py-5 sm:p-6 border-t border-gray-200">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Email Configuration</h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">
                      Configure email settings for system notifications.
                    </p>
                    
                    <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="email-from" className="block text-sm font-medium text-gray-700">From Email Address</label>
                        <div className="mt-1">
                          <input
                            type="email"
                            id="email-from"
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                            defaultValue={settings.emailFrom || ''}
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label htmlFor="email-provider" className="block text-sm font-medium text-gray-700">Email Provider</label>
                        <div className="mt-1">
                          <select
                            id="email-provider"
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                            defaultValue={settings.emailProvider || 'smtp'}
                          >
                            <option value="smtp">SMTP</option>
                            <option value="sendgrid">SendGrid</option>
                            <option value="ses">Amazon SES</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="px-4 py-3 bg-gray-50 text-right sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    onClick={() => handleSaveSettings({
                      companyName: document.getElementById('company-name').value,
                      defaultRole: document.getElementById('default-role').value,
                      emailFrom: document.getElementById('email-from').value,
                      emailProvider: document.getElementById('email-provider').value
                    })}
                    disabled={saving}
                    className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V9C5.64 9.35 4 8 4c-1.65 0-3 .35-4 2.35V12a8 8 0 018 8z"></path>
                        </svg>
                        Saving...
                      </>
                    ) : (
                      'Save Settings'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default SettingsPage;
