
'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { extractData } from '@/lib/response';
import { useAuth } from '@/context/AuthContext';
import LeadDetailsDrawer from '@/components/leads/LeadDetailsDrawer';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';

const LeadDetailPage = () => {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLead = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/leads/${params.id}`);
        setLead(response.data.lead);
      } catch (err) {
        console.error('Failed to fetch lead:', err);
        setError('Failed to load lead details');
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchLead();
    }
  }, [params.id]);

  const handleUpdateLead = async (updateData) => {
    try {
      const response = await api.put(`/leads/${params.id}`, updateData);
      setLead(prev => ({ ...prev, ...response.data }));
    } catch (err) {
      console.error('Failed to update lead:', err);
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r">
          <div className="flex">
            <div className="shrink-0">
              <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <LeadDetailsDrawer
        lead={lead}
        onClose={() => router.push('/leads')}
        onUpdate={handleUpdateLead}
      />
    </div>
  );
};

export default LeadDetailPage;
