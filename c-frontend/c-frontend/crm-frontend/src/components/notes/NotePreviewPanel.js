
import React from 'react';

/**
 * NotePreviewPanel component - Panel for displaying the selected note details
 * @param {Object} props - Component props
 * @param {Object} props.note - Note data to display
 * @param {Function} props.onEdit - Function to call when edit button is clicked
 * @param {Function} props.onClose - Function to call when close button is clicked
 * @param {boolean} props.canEditOrDelete - Whether user can edit or delete the note
 * @param {Object} props.author - Author information (optional)
 */
const NotePreviewPanel = ({ note, onEdit, onClose, canEditOrDelete = false, author = null }) => {
  if (!note) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 h-full flex items-center justify-center">
        <div className="text-center text-gray-400">
          <svg className="mx-auto h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-lg">Select a note to view its details</p>
        </div>
      </div>
    );
  }

  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    red: 'bg-red-50 border-red-200',
    gray: 'bg-gray-50 border-gray-200'
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className={`px-6 py-4 border-b ${colorClasses[note.color] || colorClasses.blue}`}>
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold text-gray-900">{note.title}</h2>
          <div className="flex items-center space-x-2">
            {canEditOrDelete && (
              <button
                onClick={() => onEdit(note)}
                className="p-1.5 rounded-md hover:bg-white/50 text-gray-600 hover:text-indigo-600 transition-colors"
                title="Edit note"
              >
                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-white/50 text-gray-600 hover:text-gray-800 transition-colors"
              title="Close preview"
            >
              <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tags */}
        {note.tags && note.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {note.tags.map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white/60 text-gray-700"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="prose prose-sm max-w-none">
          <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
            {note.content}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Created: {formatDate(note.created_at)}
          </div>
          {author && (
            <div className="flex items-center">
              <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium text-xs mr-2">
                {author.name ? author.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <span className="text-sm text-gray-700">{author.name || 'Unknown'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotePreviewPanel;
