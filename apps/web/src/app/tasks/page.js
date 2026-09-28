'use client';

import React, { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import TaskDrawer from '@/components/tasks/TaskDrawer';
import TasksPageHeader from '@/components/tasks/TasksPageHeader';

const TasksPage = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const { token, user } = useAuth();

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await api.get('/tasks');

        // Filter tasks based on user role
        const allTasks = response.data.tasks || [];
        const filteredTasks = user?.roleId === ROLE_SALES
          ? allTasks.filter(task => task.assigned_to === user.id)
          : allTasks;

        setTasks(filteredTasks);
      } catch (err) {
        console.error('Failed to fetch tasks:', err);
        if (!error) {
          setError('Failed to load tasks. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchTasks();
    }
  }, [token, error, user?.id, user?.roleId]);

  const handleCreateTask = () => {
    setEditingTask(null);
    setShowDrawer(true);
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    setShowDrawer(true);
  };

  const handleCloseDrawer = () => {
    setShowDrawer(false);
    setEditingTask(null);
  };

  const handleTaskUpdated = (updatedTask) => {
    // Refetch tasks to get the updated list
    if (token) {
      api.get('/tasks')
        .then(response => {
          const allTasks = response.data.tasks || [];
          const filteredTasks = user?.roleId === ROLE_SALES
            ? allTasks.filter(task => task.assigned_to === user.id)
            : allTasks;
          setTasks(filteredTasks);
        })
        .catch(err => {
          console.error('Failed to refresh tasks:', err);
        });
    }
    handleCloseDrawer();
  };

  const handleDeleteTask = (task) => {
    setDeleteConfirm(task);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await api.delete(`/tasks/${deleteConfirm.id}`);

      // Refetch tasks to get the updated list
      if (token) {
        api.get('/tasks')
          .then(response => {
            const allTasks = response.data.tasks || [];
            const filteredTasks = user?.roleId === ROLE_SALES
              ? allTasks.filter(task => task.assigned_to === user.id)
              : allTasks;
            setTasks(filteredTasks);
          })
          .catch(err => {
            console.error('Failed to refresh tasks:', err);
          });
      }
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete task:', err);
      alert('Failed to delete task. Please try again.');
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirm(null);
  };

  const handleTaskCreated = (newTask) => {
    // Refetch tasks to get the updated list
    if (token) {
      api.get('/tasks')
        .then(response => {
          const allTasks = response.data.tasks || [];
          const filteredTasks = user?.roleId === ROLE_SALES
            ? allTasks.filter(task => task.assigned_to === user.id)
            : allTasks;
          setTasks(filteredTasks);
        })
        .catch(err => {
          console.error('Failed to refresh tasks:', err);
        });
    }
    handleCloseDrawer();
  };

  const canEditOrDelete = (task) => {
    // Admin and Manager can edit/delete any task
    if (user?.roleId === ROLE_ADMIN || user?.roleId === ROLE_MANAGER) {
      return true;
    }
    // Sales can only edit/delete their own tasks
    return user?.roleId === ROLE_SALES && task.assigned_to === user.id;
  };

  return (
    <>
      {showDrawer && (
        <TaskDrawer
          task={editingTask}
          onSuccess={async (formData) => {
            try {
              setIsCreatingTask(true);
              setError(null);

              const endpoint = editingTask ? `/tasks/${editingTask.id}` : '/tasks';
              const method = editingTask ? 'PUT' : 'POST';

              const response = await api({
                method,
                url: endpoint,
                data: formData
              });

              // Call success callback
              if (editingTask) {
                handleTaskUpdated(response.data);
              } else {
                handleTaskCreated(response.data);
              }
            } catch (err) {
              setError(err.response?.data?.message || `Failed to ${editingTask ? 'update' : 'create'} task`);
              console.error(`Error ${editingTask ? 'updating' : 'creating'} task:`, err);
            } finally {
              setIsCreatingTask(false);
            }
          }}
          onCancel={handleCloseDrawer}
          isLoading={isCreatingTask}
        />
      )}
      {deleteConfirm && (
        <div className="fixed z-50 inset-0 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={handleCancelDelete}></div>

            {/* Center modal */}
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <svg className="h-6 w-6 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      Delete Task
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Are you sure you want to delete &ldquo;{deleteConfirm.title}&rdquo;? This action cannot be undone.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={handleCancelDelete}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ProtectedRoute allowedRoles={[ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES]}>
        <AppLayout>
          <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-0">
            {/* Page Header with Gradient Background */}
            <TasksPageHeader
              count={tasks.length}
              onRefresh={() => {
                setError(null);
                if (token) {
                  api.get('/tasks')
                    .then(response => {
                      const allTasks = response.data.tasks || [];
                      const filteredTasks = user?.roleId === ROLE_SALES
                        ? allTasks.filter(task => task.assigned_to === user.id)
                        : allTasks;
                      setTasks(filteredTasks);
                    })
                    .catch(err => {
                      console.error('Failed to refresh tasks:', err);
                    });
                }
              }}
              onAddTask={handleCreateTask}
            />

            <div className="bg-white shadow overflow-hidden sm:rounded-md rounded-lg">
              {loading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                    <p className="mt-2 text-sm text-gray-500">Loading tasks...</p>
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
                          Error loading tasks
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
                                api.get('/tasks')
                                  .then(response => {
                                    const allTasks = response.data.tasks || [];
                                    const filteredTasks = user?.roleId === ROLE_SALES
                                      ? allTasks.filter(task => task.assigned_to === user.id)
                                      : allTasks;
                                    setTasks(filteredTasks);
                                  })
                                  .catch(err => {
                                    console.error('Failed to refresh tasks:', err);
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
              ) : tasks.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-500 mb-4">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  </div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900">No tasks found</h3>
                  <div className="mt-2 max-w-xl text-sm text-gray-500 mx-auto text-center">
                    Get started by creating your first task or assigning tasks to team members.
                  </div>
                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={handleCreateTask}
                      className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Create Task
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-5 sm:p-6">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Title
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Due Date
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Priority
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Assigned To
                          </th>
                          <th scope="col" className="relative px-6 py-3">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {tasks.map((task) => (
                          <tr key={task.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{task.title}</div>
                              {task.description && (
                                <div className="text-sm text-gray-500">{task.description}</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {new Date(task.due_date).toLocaleDateString()}
                              </div>
                              <div className="text-sm text-gray-500">
                                {new Date(task.due_date).toLocaleTimeString()}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                task.priority === 'high' ? 'bg-red-100 text-red-800' :
                                task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-green-100 text-green-800'
                              }`}>
                                {task.priority}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                task.status === 'completed' ? 'bg-green-100 text-green-800' :
                                task.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                task.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {task.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {task.assigned_to_name || 'Unassigned'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              {canEditOrDelete(task) && (
                                <div className="flex justify-end space-x-2">
                                  <button
                                    onClick={() => handleEditTask(task)}
                                    className="text-indigo-600 hover:text-indigo-900"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTask(task)}
                                    className="text-red-600 hover:text-red-900"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </AppLayout>
      </ProtectedRoute>
    </>
  );
};

export default TasksPage;
