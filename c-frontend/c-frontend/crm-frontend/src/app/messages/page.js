'use client';

import React from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import Chat from '@/components/chat/Chat';
import ChatPageHeader from '@/components/chat/ChatPageHeader';

const MessagesPage = () => {
  return (
    <ProtectedRoute roles={[ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <ChatPageHeader 
            count={0} 
            onRefresh={() => window.location.reload()} 
            onNewChat={() => {}} 
          />
          <Chat />
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default MessagesPage;
