/**
 * Sidebar component for navigation
 * Features enterprise design with clear section separation and improved styling
 */
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useChatNotifications } from '@/components/chat/ChatNotificationContext';
import { getMenuItemsByRole } from '@/lib/menuConfig';

// Icon components for menu items
const HomeIcon = () => (
  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const UsersIcon = () => (
  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const LightbulbIcon = () => (
  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);

const BriefcaseIcon = () => (
  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const MailIcon = () => (
  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const ChatIcon = () => (
  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const ChartBarIcon = () => (
  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const UserGroupIcon = () => (
  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const CogIcon = () => (
  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ServerIcon = () => (
  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
  </svg>
);

const FileTextIcon = () => (
  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

// Map icon names to components
const iconMap = {
  home: HomeIcon,
  users: UsersIcon,
  lightbulb: LightbulbIcon,
  briefcase: BriefcaseIcon,
  'check-circle': CheckCircleIcon,
  calendar: CalendarIcon,
  'chart-bar': ChartBarIcon,
  'user-group': UserGroupIcon,
  cog: CogIcon,
  server: ServerIcon,
  'file-text': FileTextIcon,
  mail: MailIcon,
  chat: ChatIcon
};

const Sidebar = ({ mobile = false, onClose }) => {
  const pathname = usePathname();
  const { user } = useAuth();
  const { unreadCount } = useChatNotifications();
  const [collapsed, setCollapsed] = useState(false);
  const userRoleId = user?.roleId;
  const menuCategories = getMenuItemsByRole(userRoleId);

  return (
    <div className={`${mobile ? '' : 'hidden md:flex md:shrink-0'}`}>
      <div className={`flex flex-col ${mobile ? 'w-full' : collapsed ? 'w-16' : 'w-64'} transition-all duration-300`}>
        <div className={`flex flex-col h-0 flex-1 ${mobile ? 'border-r border-[var(--border)]' : 'border-r border-[var(--border)]'} bg-[var(--app-sidebar)]`}>
          {/* Logo and collapse toggle */}
          <div className={`flex items-center justify-between shrink-0 ${mobile ? 'px-3 py-3' : 'px-4 py-4'} border-b border-[var(--border)]`}>
            {!collapsed && (
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`${mobile ? 'h-7 w-7' : 'h-9 w-9'} rounded-md bg-indigo-600 flex items-center justify-center`}>
                    <span className={`${mobile ? 'text-base' : 'text-lg'} text-white font-bold`}>C</span>
                  </div>
                </div>
                <div className={`${mobile ? 'ml-1.5' : 'ml-2'}`}>
                  <h1 className={`${mobile ? 'text-lg' : 'text-xl'} font-bold text-gray-900`}>CRM</h1>
                </div>
              </div>
            )}
            {!mobile && (
              <button
                type="button"
                className="p-1 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                onClick={() => setCollapsed(!collapsed)}
              >
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}

          </div>

          {/* Navigation menu */}
          <nav className={`mt-0 flex-1 ${mobile ? 'px-1' : 'px-2'} ${mobile ? 'space-y-4' : 'space-y-6'} overflow-y-auto overflow-x-hidden`}>
            {menuCategories.map((category, categoryIndex) => (
              <div key={categoryIndex} className="space-y-1">
                {!collapsed && category.label && (
                  <div className={`${mobile ? 'px-2 py-1.5' : 'px-3 py-2'} text-xs font-semibold uppercase tracking-wider ${
                    categoryIndex === 0 ? 'text-gray-500 mt-4' : 'text-gray-500'
                  }`}>
                    {category.label}
                  </div>
                )}
                {category.items.map((item, itemIndex) => {
                  const isActive = pathname === item.route;
                  const IconComponent = iconMap[item.icon];
                  const isChatItem = item.route === '/chat';
                  const showUnreadBadge = isChatItem && unreadCount > 0;

                  return (
                    <Link
                      key={item.route}
                      href={item.route}
                      onClick={mobile ? onClose : undefined}
                      className={`group flex items-center ${mobile ? 'px-2 py-2' : 'px-3 py-2.5'} text-sm font-medium rounded-lg transition-all duration-150 ease-in-out ${
                        isActive
                          ? 'bg-indigo-50 border-l-4 border-indigo-600 text-indigo-700 shadow-sm'
                          : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                      title={collapsed ? item.label : undefined}
                    >
                      {IconComponent && (
                        <IconComponent
                          className={`shrink-0 h-5 w-5 transition-all duration-150 ${
                            isActive
                              ? 'text-indigo-600'
                              : 'text-gray-400 group-hover:text-gray-500'
                          }`}
                          aria-hidden="true"
                        />
                      )}
                      {!collapsed && (
                        <span className={`${mobile ? 'ml-2' : 'ml-3'} transition-all duration-150`}>{item.label}</span>
                      )}
                      {showUnreadBadge && !collapsed && (
                        <span className="ml-auto inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium text-white bg-red-500 rounded-full">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                      {isActive && !collapsed && !showUnreadBadge && (
                        <span className="ml-auto inline-block py-0.5 px-2 text-xs font-medium text-indigo-600 bg-indigo-100 rounded-full">
                          Active
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
