"use client";

import React, { useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import UsersTable from '@/components/users/UsersTable';
import CreateUserDrawer from '@/components/users/CreateUserDrawer';
import EditUserDrawer from '@/components/users/EditUserDrawer';
import UsersPageHeader from '@/components/users/UsersPageHeader';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { ROLE_ADMIN } from '@/lib/constants';
import { extractData } from '@/lib/response';

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const { token } = useAuth();

  // Fetch users from API
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/users');
      const data = extractData(response);
      setUsers(data.users || []);
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Your session has expired. Please log in again.');
      } else if (err.response?.status === 403) {
        setError('You do not have permission to view users.');
      } else if (err.response?.status >= 500) {
        setError('Server error. Please try again later.');
      } else {
        setError('Failed to load users. Please try again.');
      }
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchUsers();
    }
  }, [token, fetchUsers]);

  const handleStatusChange = (userId, newStatus) => {
    setUsers(prevUsers =>
      prevUsers.map(user =>
        user.id === userId ? { ...user, is_active: newStatus === 'Active' } : user
      )
    );
  };

  const [editingUser, setEditingUser] = useState(null);

  const handleEdit = (user) => {
    setEditingUser(user);
    setShowEditDrawer(true);
  };

  const handleCreateUser = () => {
    setShowCreateDrawer(true);
  };

  const handleCreateUserSubmit = async (userData) => {
    try {
      setIsCreatingUser(true);
      const response = await api.post('/users', userData);
      const newUser = response.data?.user || response.data || response;
      setUsers(prevUsers => [...prevUsers, newUser]);
      setShowCreateDrawer(false);
      return response;
    } catch (err) {
      console.error('Failed to create user:', err);
      throw err;
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleCancelCreateUser = () => {
    setShowCreateDrawer(false);
  };

  const handleCancelEditUser = () => {
    setShowEditDrawer(false);
    setEditingUser(null);
  };

  const handleEditUserSubmit = async (userData) => {
    try {
      setIsUpdatingUser(true);
      const response = await api.put(`/users/${editingUser.id}`, userData);
      const updatedUser = response.data?.user || response.data || userData;
      setUsers(prevUsers =>
        prevUsers.map(user =>
          user.id === editingUser.id ? { ...user, ...updatedUser } : user
        )
      );
      setShowEditDrawer(false);
      setEditingUser(null);
      return response;
    } catch (err) {
      console.error('Failed to update user:', err);
      throw err;
    } finally {
      setIsUpdatingUser(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={[ROLE_ADMIN]}>
      <AppLayout>
        <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
          <UsersPageHeader
            count={users.length}
            onRefresh={fetchUsers}
            onAddUser={handleCreateUser}
          />

          <UsersTable
            users={users}
            loading={loading}
            error={error}
            onEdit={handleEdit}
            onStatusChange={handleStatusChange}
          />

          {showCreateDrawer && (
            <CreateUserDrawer
              onSubmit={handleCreateUserSubmit}
              onCancel={handleCancelCreateUser}
              isLoading={isCreatingUser}
            />
          )}

          {showEditDrawer && editingUser && (
            <EditUserDrawer
              user={editingUser}
              onSubmit={handleEditUserSubmit}
              onCancel={handleCancelEditUser}
              isLoading={isUpdatingUser}
            />
          )}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
};

export default UsersPage;
