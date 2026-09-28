
'use client';

import React, { useState, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import Chat from '@/components/chat/Chat';
import ChatPageHeader from '@/components/chat/ChatPageHeader';
import ConversationParticipants from '@/components/chat/ConversationParticipants';
import NewChatDrawer from '@/components/chat/NewChatDrawer';

const ChatPage = () => {
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const handleNewChat = useCallback(() => {
    setShowNewChatModal(true);
  }, []);

  const handleChatCreated = useCallback(() => {
    setShowNewChatModal(false);
    setRefreshKey(prev => prev + 1);
  }, []);

  const handleShowParticipants = useCallback((conversationId) => {
    setActiveConversationId(conversationId);
    setShowParticipantsModal(true);
  }, []);

  const handleParticipantsClose = useCallback(() => {
    setShowParticipantsModal(false);
    setActiveConversationId(null);
  }, []);

  return (
    <ProtectedRoute roles={[ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0 h-[calc(100vh-4rem)]">
          <ChatPageHeader
            count={0}
            onRefresh={handleRefresh}
            onNewChat={handleNewChat}
          />
          <Chat key={refreshKey} onShowParticipants={handleShowParticipants} />
        </div>
        <NewChatDrawer
          isOpen={showNewChatModal}
          onClose={() => setShowNewChatModal(false)}
          onSuccess={handleChatCreated}
        />
        <ConversationParticipants
          conversationId={activeConversationId}
          isOpen={showParticipantsModal}
          onClose={handleParticipantsClose}
        />
      </AppLayout>
    </ProtectedRoute>
  );
};

export default ChatPage;
