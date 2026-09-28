
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import InitiateCallButton from '@/components/calls/InitiateCallButton';
import ActiveCall from '@/components/calls/ActiveCall';
import QuickSendMessage from '@/components/lead-messages/QuickSendMessage';
import LeadDetailsDrawer from './LeadDetailsDrawer';

/**
 * LeadsKanban component - Enterprise-grade Kanban-style pipeline view for leads
 * Status-agnostic design that works with any status configuration
 * @param {Object} props - Component props
 * @param {Array} props.leads - Array of lead objects
 * @param {Function} props.onViewLead - Function to call when View button is clicked
 * @param {Function} props.onEditLead - Function to call when Edit button is clicked
 * @param {Function} props.onDeleteLead - Function to call when Delete button is clicked
 * @param {Function} props.onAssignLead - Function to call when Assign button is clicked
 * @param {Function} props.onStatusChange - Function to call when lead status is changed
 * @param {Function} props.onCreateLead - Function to call when creating a new lead
 * @param {Array} props.statuses - Array of status objects (optional, will use LEAD_STATUSES if not provided)
 */
const LeadsKanban = ({
  leads = [],
  onViewLead,
  onEditLead,
  onDeleteLead,
  onAssignLead,
  onStatusChange,
  onCreateLead,
  statuses
}) => {
  const { user } = useAuth();
  const [activeCallId, setActiveCallId] = useState(null);
  const [draggedLead, setDraggedLead] = useState(null);
  const [expandedStage, setExpandedStage] = useState(null);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [selectedLead, setSelectedLead] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Default to LEAD_STATUSES if statuses prop is not provided
  const stageStatuses = statuses || [
    { id: 1, name: 'New', color: 'blue' },
    { id: 2, name: 'Contacted', color: 'purple' },
    { id: 3, name: 'Qualified', color: 'green' },
    { id: 4, name: 'Converted', color: 'emerald' },
    { id: 5, name: 'Lost', color: 'red' }
  ];

  // Get color configuration based on status color
  const getColorConfig = (color) => {
    const colorMap = {
      blue: {
        bg: 'bg-blue-50/60',
        border: 'border-blue-100/50',
        text: 'text-blue-600',
        accent: 'bg-blue-400',
        count: 'bg-blue-50/80 text-blue-600',
        hover: 'hover:bg-blue-50'
      },
      purple: {
        bg: 'bg-purple-50/60',
        border: 'border-purple-100/50',
        text: 'text-purple-600',
        accent: 'bg-purple-400',
        count: 'bg-purple-50/80 text-purple-600',
        hover: 'hover:bg-purple-50'
      },
      green: {
        bg: 'bg-green-50/60',
        border: 'border-green-100/50',
        text: 'text-green-600',
        accent: 'bg-green-400',
        count: 'bg-green-50/80 text-green-600',
        hover: 'hover:bg-green-50'
      },
      emerald: {
        bg: 'bg-emerald-50/60',
        border: 'border-emerald-100/50',
        text: 'text-emerald-600',
        accent: 'bg-emerald-400',
        count: 'bg-emerald-50/80 text-emerald-600',
        hover: 'hover:bg-emerald-50'
      },
      red: {
        bg: 'bg-red-50/60',
        border: 'border-red-100/50',
        text: 'text-red-600',
        accent: 'bg-red-400',
        count: 'bg-red-50/80 text-red-600',
        hover: 'hover:bg-red-50'
      },
      orange: {
        bg: 'bg-orange-50/60',
        border: 'border-orange-100/50',
        text: 'text-orange-600',
        accent: 'bg-orange-400',
        count: 'bg-orange-50/80 text-orange-600',
        hover: 'hover:bg-orange-50'
      },
      yellow: {
        bg: 'bg-yellow-50/60',
        border: 'border-yellow-100/50',
        text: 'text-yellow-600',
        accent: 'bg-yellow-400',
        count: 'bg-yellow-50/80 text-yellow-600',
        hover: 'hover:bg-yellow-50'
      },
      gray: {
        bg: 'bg-gray-50/60',
        border: 'border-gray-100/50',
        text: 'text-gray-600',
        accent: 'bg-gray-400',
        count: 'bg-gray-50/80 text-gray-600',
        hover: 'hover:bg-gray-50'
      }
    };
    return colorMap[color] || colorMap.gray;
  };



  // Group leads by stage
  const getLeadsByStage = (stageId) => {
    const stage = stageStatuses.find(s => s.id === stageId);
    const stageName = stage?.name || '';

    const filteredLeads = leads.filter(lead => {
      // Handle both numeric status (1, 2, 3, 4, 5) and string status ("New", "Contacted", etc.)
      if (typeof lead.status === 'number') {
        return lead.status === stageId;
      }
      if (typeof lead.status === 'string') {
        return lead.status === stageName;
      }
      if (typeof lead.status === 'object' && lead.status?.id) {
        return lead.status.id === stageId;
      }
      return false;
    });

    return filteredLeads;
  };

  // Calculate total value for a stage
  const getStageValue = (stageId) => {
    const stageLeads = getLeadsByStage(stageId);
    return stageLeads.reduce((sum, lead) => sum + (lead.monthly_income || lead.dealValue || 0), 0);
  };

  // Format currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(value);
  };

  // Handle drag start
  const handleDragStart = (lead, e) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle drag over
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Handle drop
  const handleDrop = (stageId, e) => {
    e.preventDefault();
    if (draggedLead && onStatusChange) {
      // Convert stage ID to status name
      const stage = stageStatuses.find(s => s.id === stageId);
      const statusName = stage ? stage.name : stageId;
      onStatusChange(draggedLead, statusName);
    }
    setDraggedLead(null);
  };

  // Handle call started
  const handleCallStarted = (callId) => {
    setActiveCallId(callId);
  };

  // Handle call ended
  const handleCallEnded = () => {
    setActiveCallId(null);
  };

  // Handle opening lead details drawer
  const handleViewLead = (lead) => {
    setSelectedLead(lead);
    setIsDrawerOpen(true);
    // Also call the parent onViewLead if provided
    if (onViewLead) {
      onViewLead(lead);
    }
  };

  // Handle closing lead details drawer
  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedLead(null);
  };

  // Get lead name with professional fallback (never returns "Unknown")
  const getLeadName = (lead) => {
    // Priority 1: full_name (database field)
    if (lead.full_name && typeof lead.full_name === 'string' && lead.full_name.trim()) {
      return lead.full_name.trim();
    }
    // Priority 2: name (aliased field)
    if (lead.name && typeof lead.name === 'string' && lead.name.trim()) {
      return lead.name.trim();
    }
    // Priority 3: firstName + lastName
    if (lead.firstName?.trim() && lead.lastName?.trim()) {
      return `${lead.firstName.trim()} ${lead.lastName.trim()}`;
    }
    // Priority 4: email username (before @)
    if (lead.email && typeof lead.email === 'string' && lead.email.includes('@')) {
      return lead.email.split('@')[0];
    }
    // Priority 5: mobile_number (last resort before Lead)
    if (lead.mobile_number && typeof lead.mobile_number === 'string' && lead.mobile_number.trim()) {
      return lead.mobile_number.trim();
    }
    // Final fallback - never "Unknown"
    return 'Lead';
  };

  // Get lead initials
  const getLeadInitials = (lead) => {
    const name = getLeadName(lead);
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Handle mobile stage navigation
  const handleStageNavigation = (direction) => {
    setCurrentStageIndex(prev => {
      const newIndex = prev + direction;
      if (newIndex >= 0 && newIndex < stageStatuses.length) {
        return newIndex;
      }
      return prev;
    });
  };

  // If there's an active call, show active call component
  if (activeCallId) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="text-center">
          <svg className="animate-pulse h-12 w-12 text-green-600 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
          </svg>
          <p className="text-lg font-medium text-gray-900">Call in progress...</p>
        </div>
        <ActiveCall
          callId={activeCallId}
          onCallEnded={handleCallEnded}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      {/* Desktop/Tablet Kanban Board */}
      <div className="hidden md:flex flex-1 overflow-x-auto overflow-y-hidden scrollbar-hide">
        <div className="flex gap-4 min-w-max px-4 md:px-6 py-6">
          {stageStatuses.map((stage) => {
            const stageLeads = getLeadsByStage(stage.id);
            const stageValue = getStageValue(stage.id);
            const colors = getColorConfig(stage.color);

            return (
              <div
                key={stage.id}
                className={`shrink-0 w-[320px] flex flex-col rounded-xl bg-white border border-gray-200 h-full`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(stage.id, e)}
              >
                {/* Stage Header */}
                <div className="sticky top-0 z-10 px-4 py-3 border-b border-gray-100 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${colors.accent}`} />
                      <h3 className="text-sm font-semibold text-gray-900">
                        {stage.name}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.count}`}>
                        {stageLeads.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onCreateLead && onCreateLead(stage.id)}
                        className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                        title={`Add lead to ${stage.name}`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    {stageLeads.length} {stageLeads.length === 1 ? 'Lead' : 'Leads'}
                  </div>
                </div>

                {/* Stage Content */}
                <div className="flex-1 overflow-y-auto px-3 py-2">
                  {stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(lead, e)}
                      className="group bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-100/60 overflow-hidden transition-all duration-200 cursor-move mb-3"
                    >
                      {/* Top Colored Bar */}
                      <div className={`h-1 rounded-t-xl ${colors.accent}`} />
                      
                      {/* Lead Header */}
                      <div className="flex items-start justify-between px-2 py-1.5">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <div className="shrink-0">
                            <div className="h-7 w-7 rounded-md bg-linear-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                              <span className="text-white font-medium text-[10px]">
                                {getLeadInitials(lead)}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <h4 className="text-xs font-medium text-gray-800 truncate">
                                {getLeadName(lead)}
                              </h4>
                              {!lead.assigned_to && (
                                <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-normal bg-amber-50/80 text-amber-600 shrink-0">
                                  Unassigned
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                      </div>

                      {/* Lead Details */}
                      <div className="space-y-1 px-2 pb-1.5">
                        {lead.email && (
                          <div className="flex items-center text-[10px] text-gray-400">
                            <svg className="h-3 w-3 mr-1 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <span className="truncate">{lead.email}</span>
                          </div>
                        )}
                        {(lead.mobile_number || lead.mobile || lead.phone) && (
                          <div className="flex items-center text-[10px] text-gray-400">
                            <svg className="h-3 w-3 mr-1 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            <span>{lead.mobile_number || lead.mobile || lead.phone}</span>
                          </div>
                        )}
                        {(lead.city || lead.country) && (
                          <div className="flex items-center text-[10px] text-gray-400">
                            <svg className="h-3 w-3 mr-1 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="truncate">{[lead.city, lead.country].filter(Boolean).join(', ')}</span>
                          </div>
                        )}
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center justify-between px-3 pt-2 border-t border-gray-100/60">
                        <div className="flex items-center gap-2">
                          {/* Call Button - filled green */}
                          {(lead.mobile_number || lead.mobile || lead.phone) && (
                            <div className="md:mb-1">
                              <InitiateCallButton
                                leadId={lead.id}
                                phoneNumber={lead.mobile_number || lead.mobile || lead.phone}
                                onCallStarted={handleCallStarted}
                                className="bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors duration-150 text-xs font-medium flex items-center gap-1.5"
                                iconOnly={false}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                Call
                              </InitiateCallButton>
                            </div>
                          )}


                        </div>

                        {/* More Actions - outline only */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleViewLead(lead)}
                            className="p-1.5 rounded hover:bg-gray-100 text-slate-400 hover:text-slate-600 transition-colors duration-150"
                            title="View details"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          {onEditLead && (
                            <button
                              onClick={() => onEditLead(lead)}
                              className="p-1.5 rounded hover:bg-gray-100 text-slate-400 hover:text-slate-600 transition-colors duration-150"
                              title="Edit lead"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {stageLeads.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-center opacity-60">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium">No leads in this stage</p>
                      <p className="text-xs text-slate-400 mt-1">Drag leads here or create new</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile Stage Sections */}
      <div className="md:hidden flex-1 overflow-y-auto px-4 py-4">
        {/* Stage Navigation Header */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-3 mb-3 shadow-sm">
          <div className="flex items-center justify-between">
            <button
              onClick={() => handleStageNavigation(-1)}
              disabled={currentStageIndex === 0}
              className="p-2 rounded-lg bg-white shadow-sm border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md transition-shadow"
            >
              <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 text-center px-2">
              <div className="flex items-center justify-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${getColorConfig(stageStatuses[currentStageIndex]?.color || 'gray').accent}`} />
                <h3 className="text-sm font-bold text-gray-900">
                  {stageStatuses[currentStageIndex]?.name}
                </h3>
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                {getLeadsByStage(stageStatuses[currentStageIndex]?.id).length} leads
              </p>
            </div>
            <button
              onClick={() => handleStageNavigation(1)}
              disabled={currentStageIndex === stageStatuses.length - 1}
              className="p-2 rounded-lg bg-white shadow-sm border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md transition-shadow"
            >
              <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Stage Indicators */}
        <div className="flex justify-center gap-1.5 mb-3">
          {stageStatuses.map((stage, index) => (
            <div
              key={stage.id}
              className={`h-1 rounded-full transition-all duration-200 ${
                index === currentStageIndex ? 'w-5 bg-indigo-600' : 'w-1.5 bg-gray-300'
              }`}
            />
          ))}
        </div>

        {/* Current Stage Content */}
        <div className="space-y-3">
          {(() => {
            const currentStage = stageStatuses[currentStageIndex];
            if (!currentStage) return null;

            const stageLeads = getLeadsByStage(currentStage.id);
            const colors = getColorConfig(currentStage.color);

            return (
              <>
                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="bg-white rounded-xl shadow-sm hover:shadow-lg border border-gray-100/60 overflow-hidden transition-all duration-200 mb-4"
                  >
                    {/* Top Colored Bar */}
                    <div className={`h-1 rounded-t-lg ${colors.accent}`} />

                    {/* Mobile Card Content */}
                    <div className="p-3">
                      {/* Avatar + Name + Value */}
                      <div className="flex items-start gap-2.5 mb-3">
                        <div className="shrink-0">
                          <div className="h-11 w-11 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                            <span className="text-white font-bold text-sm">
                              {getLeadInitials(lead)}
                            </span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <h4 className="text-sm font-semibold text-gray-900 truncate">
                              {getLeadName(lead)}
                            </h4>
                            {!lead.assigned_to && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 shrink-0">
                                Unassigned
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Stacked Details */}
                      <div className="space-y-1 mb-2.5">
                        {lead.email && (
                          <div className="flex items-center text-xs text-gray-600">
                            <svg className="h-3.5 w-3.5 mr-2 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <span className="truncate">{lead.email}</span>
                          </div>
                        )}
                        {(lead.mobile_number || lead.mobile || lead.phone) && (
                          <div className="flex items-center text-xs text-gray-600">
                            <svg className="h-3.5 w-3.5 mr-2 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            <span>{lead.mobile_number || lead.mobile || lead.phone}</span>
                          </div>
                        )}
                        {(lead.city || lead.country) && (
                          <div className="flex items-center text-xs text-gray-600">
                            <svg className="h-3.5 w-3.5 mr-2 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="truncate">{[lead.city, lead.country].filter(Boolean).join(', ')}</span>
                          </div>
                        )}
                      </div>

                      {/* Mobile Card Footer */}
                      <div className="flex items-center gap-1.5 pt-2.5 border-t border-gray-100">
                        {(lead.mobile_number || lead.mobile || lead.phone) && (
                          <InitiateCallButton
                            leadId={lead.id}
                            phoneNumber={lead.mobile_number || lead.mobile || lead.phone}
                            onCallStarted={handleCallStarted}
                            className="bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 transition-colors duration-150 text-xs font-semibold shadow-sm hover:shadow-md"
                            iconOnly={false}
                          >
                            Call
                          </InitiateCallButton>
                        )}
                        <div className="flex items-center gap-0.5 ml-auto">
                          <button
                            onClick={() => handleViewLead(lead)}
                            className="p-1.5 rounded hover:bg-gray-100 text-slate-400 hover:text-slate-600 transition-colors duration-150"
                            title="View details"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          {onEditLead && (
                            <button
                              onClick={() => onEditLead(lead)}
                              className="p-1.5 rounded hover:bg-gray-100 text-slate-400 hover:text-slate-600 transition-colors duration-150"
                              title="Edit lead"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {stageLeads.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center mb-3 shadow-sm">
                      <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-gray-700">No leads in this stage</p>
                    <p className="text-xs text-gray-500 mt-1.5">Tap + to create a new lead</p>
                  </div>
                )}

                {/* Floating Add Button */}
                {onCreateLead && (
                  <button
                    onClick={() => onCreateLead(currentStage.id)}
                    className="fixed bottom-6 right-6 w-14.9 h-14.9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center transition-colors duration-200"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Lead Details Drawer */}
      {isDrawerOpen && selectedLead && (
        <LeadDetailsDrawer
          lead={selectedLead}
          onClose={handleCloseDrawer}
        />
      )}
    </div>
  );
};

export default LeadsKanban;