
import React from 'react';

/**
 * NoteCard component - Card for displaying a single note
 * @param {Object} props - Component props
 * @param {Object} props.note - Note data
 * @param {Function} props.onClick - Function to call when card is clicked
 * @param {Function} props.onEdit - Function to call when edit button is clicked
 * @param {Function} props.onDelete - Function to call when delete button is clicked
 * @param {boolean} props.canEditOrDelete - Whether user can edit or delete the note
 * @param {boolean} props.isSelected - Whether the note is currently selected
 * @param {Object} props.author - Author information (optional)
 */
const NoteCard = ({
  note,
  onClick,
  onEdit,
  onDelete,
  onToggleImportant,
  canEditOrDelete = false,
  isSelected = false,
  isChecked = false,
  isSelectable = false,
  isImportant = false,
  author = null
}) => {
  const selectedClasses = isSelected ? 'ring-2 ring-indigo-500 ring-offset-2' : '';

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();

    // Reset time components to compare dates only
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Calculate difference in days
    const diffTime = nowOnly - dateOnly;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const priorityMap = {
    red: { label: 'High', className: 'border-red-300 text-red-700 bg-red-50' },
    yellow: { label: 'Medium', className: 'border-amber-300 text-amber-700 bg-amber-50' },
    green: { label: 'Low', className: 'border-green-300 text-green-700 bg-green-50' },
    blue: { label: 'Normal', className: 'border-indigo-200 text-indigo-700 bg-indigo-50' },
    purple: { label: 'Normal', className: 'border-indigo-200 text-indigo-700 bg-indigo-50' },
    gray: { label: 'Normal', className: 'border-indigo-200 text-indigo-700 bg-indigo-50' }
  };
  const priority = priorityMap[note.color] || priorityMap.blue;
  const tagPalette = [
    { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
    { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
    { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' }
  ];
  const getTagTone = (tag) => {
    if (!tag) return tagPalette[0];
    const normalized = String(tag).trim().toLowerCase();
    if (normalized === 'important') {
      return tagPalette[2];
    }
    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      hash = (hash + normalized.charCodeAt(i) * (i + 1)) % tagPalette.length;
    }
    return tagPalette[hash];
  };
  const tagLabel = note.tags && note.tags.length > 0 ? note.tags[0] : 'General';
  const tagTone = getTagTone(tagLabel);

  const handleEditClick = (e) => {
    e.stopPropagation();
    onEdit(note);
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    onDelete(note);
  };

  const handleToggleImportant = (e) => {
    e.stopPropagation();
    if (onToggleImportant) {
      onToggleImportant(note);
    }
  };

  const handleCheckboxChange = (e) => {
    e.stopPropagation();
    if (isSelectable && note?.id && onClick) {
      onClick(note, { toggleSelection: true });
    }
  };

  return (
    <div
      onClick={() => onClick(note)}
      className={`group relative p-4 rounded-xl border border-gray-200 bg-white cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md ${selectedClasses}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {isSelectable && (
            <input
              type="checkbox"
              checked={isChecked}
              onChange={handleCheckboxChange}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${priority.className}`}>
            {priority.label}
          </span>
        </div>
        {canEditOrDelete && (
          <button
            onClick={handleEditClick}
            className="p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Edit note"
          >
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>

      <h3 className="mt-3 text-base font-semibold text-gray-900 line-clamp-2">{note.title}</h3>
      <div className="mt-1 flex items-center text-xs text-gray-500">
        <svg className="h-3.5 w-3.5 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        {formatDate(note.updated_at || note.created_at)}
      </div>

      <p className="mt-3 text-sm text-gray-600 line-clamp-3">{note.content}</p>

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {author && (
            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-xs">
              {author.name ? author.name.charAt(0).toUpperCase() : 'U'}
            </div>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${tagTone.bg} ${tagTone.text} ${tagTone.border}`}>
            {tagLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onToggleImportant && (
            <button
              onClick={handleToggleImportant}
              className={`p-1.5 rounded-md transition-colors ${
                isImportant ? 'text-amber-500 bg-amber-50' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'
              }`}
              title={isImportant ? 'Remove from important' : 'Mark as important'}
            >
              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill={isImportant ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.967a1 1 0 00.95.69h4.178c.969 0 1.371 1.24.588 1.81l-3.38 2.455a1 1 0 00-.364 1.118l1.287 3.966c.3.922-.755 1.688-1.54 1.118l-3.381-2.454a1 1 0 00-1.175 0l-3.38 2.454c-.785.57-1.84-.196-1.54-1.118l1.287-3.966a1 1 0 00-.364-1.118L2.044 9.394c-.783-.57-.38-1.81.588-1.81h4.178a1 1 0 00.95-.69l1.286-3.967z" />
              </svg>
            </button>
          )}
          {canEditOrDelete && (
            <button
              onClick={handleDeleteClick}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete note"
            >
              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NoteCard;
