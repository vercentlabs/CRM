
import React, { useState, useEffect } from 'react';
import './NotesDrawer.css';

/**
 * NotesDrawer component - Drawer for creating or editing a note
 * @param {Object} props - Component props
 * @param {Object} props.note - Note data for update mode (optional)
 * @param {Function} props.onSuccess - Function to call when form is submitted successfully
 * @param {Function} props.onCancel - Function to call when drawer is cancelled
 * @param {boolean} props.isLoading - Whether form is in loading state
 */
const NotesDrawer = ({ note, onSuccess, onCancel, isLoading = false }) => {
  // Form state
  const [formData, setFormData] = useState({
    title: note?.title || '',
    content: note?.content || '',
    color: note?.color || 'blue',
    tags: note?.tags || []
  });

  const [tagInput, setTagInput] = useState('');

  const [errors, setErrors] = useState({});
  const isUpdate = Boolean(note?.id);
  const colorByPriority = {
    low: 'green',
    medium: 'yellow',
    high: 'red',
    normal: 'blue'
  };
  const priorityByColor = {
    green: 'low',
    yellow: 'medium',
    red: 'high',
    blue: 'normal',
    purple: 'normal',
    gray: 'normal'
  };
  const [priority, setPriority] = useState(priorityByColor[formData.color] || 'normal');

  // Handle ESC key press and prevent body scroll
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    // Add ESC key listener
    window.addEventListener('keydown', handleEsc);

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onCancel]);

  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error for this field if it exists
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const handlePriorityChange = (value) => {
    setPriority(value);
    setFormData(prev => ({
      ...prev,
      color: colorByPriority[value] || 'blue'
    }));
  };

  // Handle tag input
  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleTagInputKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  // Validate form data
  const validateForm = () => {
    const newErrors = {};

    // Validate required fields
    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.content.trim()) {
      newErrors.content = 'Content is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // Filter out empty values before submitting, but keep empty arrays for tags
    const submitData = Object.fromEntries(
      Object.entries(formData).filter(([key, value]) => {
        // Keep tags even if it's an empty array
        if (key === 'tags') return true;
        // Filter out other empty values
        return value !== '' && value !== null && value !== undefined;
      })
    );

    onSuccess(submitData);
  };

  const priorityOptions = [
    { value: 'high', label: 'High', className: 'border-red-300 text-red-700 bg-red-50' },
    { value: 'medium', label: 'Medium', className: 'border-amber-300 text-amber-700 bg-amber-50' },
    { value: 'low', label: 'Low', className: 'border-green-300 text-green-700 bg-green-50' },
    { value: 'normal', label: 'Normal', className: 'border-indigo-200 text-indigo-700 bg-indigo-50' }
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 animate-fade-in" onClick={onCancel}></div>

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] bg-white shadow-2xl animate-slide-in-right flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20h9" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 3.5l4 4L7 21H3v-4L16.5 3.5z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {isUpdate ? 'Edit Note' : 'Create New Note'}
                </h2>
                <p className="text-sm text-gray-500">Keep your ideas organized and accessible.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100"
            >
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {/* Title Field */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="Enter note title"
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  errors.title ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title}</p>
              )}
            </div>

            {/* Priority Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Priority
              </label>
              <div className="flex flex-wrap gap-2">
                {priorityOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handlePriorityChange(option.value)}
                    className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                      priority === option.value
                        ? `${option.className} ring-2 ring-indigo-200`
                        : 'border-gray-200 text-gray-600 hover:border-indigo-200 hover:text-indigo-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags Field */}
            <div>
              <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">
                Tags <span className="text-gray-400">(optional)</span>
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  id="tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={handleTagInputKeyPress}
                  placeholder="Add a tag and press Enter"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Add
                </button>
              </div>
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-700"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-2 text-indigo-500 hover:text-indigo-700"
                      >
                        <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {/* Content Field */}
            <div>
              <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
                Content <span className="text-red-500">*</span>
              </label>
              <textarea
                id="content"
                name="content"
                value={formData.content}
                onChange={handleInputChange}
                placeholder="Enter your note content"
                rows={10}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none ${
                  errors.content ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.content && (
                <p className="mt-1 text-sm text-red-600">{errors.content}</p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-white">
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
              >
                {isLoading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {isUpdate ? 'Updating...' : 'Creating...'}
                  </span>
                ) : (
                  isUpdate ? 'Update Note' : 'Create Note'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
};

export default NotesDrawer;
