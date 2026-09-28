import React, { useState, useEffect, useCallback, useMemo } from "react";
import LeadStatusBadge from "./LeadStatusBadge";

/**
 * EditLeadForm component - Form for editing an existing lead
 * @param {Object} props - Component props
 * @param {Object} props.lead - The lead object to edit
 * @param {Function} props.onSubmit - Function to call when form is submitted
 * @param {Function} props.onCancel - Function to call when form is cancelled
 * @param {boolean} props.isLoading - Whether form is in loading state
 */
const EditLeadForm = ({
  lead,
  onSubmit,
  onCancel,
  isLoading = false,
  onStatusUpdate,
  statusUpdateLoading = false,
}) => {
  // Initialize form data directly from props using useMemo
  const initialFormData = useMemo(
    () => ({
      status: lead?.status || "New",
      notes: lead?.notes || "",
      next_call_at: lead?.next_call_at || "",
      email: lead?.email || "",
      address: lead?.address || "",
    }),
    [lead],
  );

  // Form state - initialized directly
  const [formData, setFormData] = useState(initialFormData);

  // State for status change confirmation
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null);

  // State for form validation errors
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (lead) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        status: lead.status || "New",
        notes: lead.notes || "",
        next_call_at: lead.next_call_at || "",
        email: lead.email || "",
        address: lead.address || "",
      });
    }
  }, [lead]);

  // Handle input changes
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }, []);

  // Validate form data
  const validateForm = useCallback(() => {
    const newErrors = {};

    // Validate next_call_at is in the future if provided
    if (formData.next_call_at) {
      const nextCallDate = new Date(formData.next_call_at);
      const now = new Date();

      if (nextCallDate < now) {
        newErrors.next_call_at = "Next call date must be in the future";
      }
    }

    // Validate email format if provided
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData.next_call_at, formData.email]);

  // Handle form submission
  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();

      if (validateForm()) {
        onSubmit(formData);
      }
    },
    [validateForm, onSubmit, formData],
  );

  // Handle status change with confirmation
  const handleStatusChange = useCallback(
    (e) => {
      const newStatus = e.target.value;

      // If changing to "Converted" or "Lost", show confirmation dialog
      if (
        (newStatus === "Converted" || newStatus === "Lost") &&
        newStatus !== formData.status
      ) {
        setPendingStatus(newStatus);
        setShowStatusConfirm(true);
      } else {
        // Directly update for other status changes
        setFormData((prev) => ({
          ...prev,
          status: newStatus,
        }));
      }
    },
    [formData.status],
  );

  // Confirm status change
  const confirmStatusChange = useCallback(() => {
    if (pendingStatus && onStatusUpdate) {
      // Call instant status update function
      onStatusUpdate(pendingStatus);

      // Update local form state
      setFormData((prev) => ({
        ...prev,
        status: pendingStatus,
      }));

      // Close confirmation dialog
      setShowStatusConfirm(false);
      setPendingStatus(null);
    }
  }, [pendingStatus, onStatusUpdate]);

  // Cancel status change
  const cancelStatusChange = useCallback(() => {
    setShowStatusConfirm(false);
    setPendingStatus(null);
  }, []);

  // Lead status options
  const statusOptions = useMemo(
    () => [
      { value: "New", label: "New" },
      { value: "Contacted", label: "Contacted" },
      { value: "Qualified", label: "Qualified" },
      { value: "Converted", label: "Converted" },
      { value: "Lost", label: "Lost" },
    ],
    [],
  );

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Edit Lead
        </h3>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Lead Name (Read-only) */}
          <div>
            <label
              htmlFor="leadName"
              className="block text-sm font-medium text-gray-700"
            >
              Lead Name
            </label>
            <div className="mt-1">
              <input
                type="text"
                id="leadName"
                value={
                  lead?.firstName && lead?.lastName
                    ? `${lead.firstName} ${lead.lastName}`
                    : lead?.name || "Unknown"
                }
                disabled
                className="shadow-sm bg-gray-100 focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md cursor-not-allowed"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Lead name cannot be changed
            </p>
          </div>

          {/* Status */}
          <div>
            <label
              htmlFor="status"
              className="block text-sm font-medium text-gray-700"
            >
              Status
            </label>
            <div className="mt-1 flex items-center space-x-2">
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleStatusChange}
                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="shrink-0">
                <LeadStatusBadge status={formData.status} />
              </div>
            </div>
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <div className="mt-1">
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                  errors.email ? "border-red-500" : ""
                }`}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email}</p>
              )}
            </div>
          </div>

          {/* Address */}
          <div>
            <label
              htmlFor="address"
              className="block text-sm font-medium text-gray-700"
            >
              Address
            </label>
            <div className="mt-1">
              <textarea
                id="address"
                name="address"
                rows={3}
                value={formData.address}
                onChange={handleInputChange}
                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
              />
            </div>
          </div>

          {/* Next Call Date */}
          <div>
            <label
              htmlFor="next_call_at"
              className="block text-sm font-medium text-gray-700"
            >
              Next Call Date
            </label>
            <div className="mt-1">
              <input
                type="datetime-local"
                id="next_call_at"
                name="next_call_at"
                value={formData.next_call_at}
                onChange={handleInputChange}
                min={new Date().toISOString().slice(0, 16)} // Prevent selecting past dates
                className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                  errors.next_call_at ? "border-red-500" : ""
                }`}
              />
              {errors.next_call_at && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.next_call_at}
                </p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-gray-700"
            >
              Notes
            </label>
            <div className="mt-1">
              <textarea
                id="notes"
                name="notes"
                rows={4}
                value={formData.notes}
                onChange={handleInputChange}
                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="Add notes about this lead..."
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Status change confirmation dialog */}
      {showStatusConfirm && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Confirm Status Change
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Are you sure you want to change the lead status to{" "}
              <span className="font-medium">
                {pendingStatus === "Converted" ? "Converted" : "Lost"}
              </span>
              ? This action will be saved immediately.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelStatusChange}
                className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              <button
                onClick={confirmStatusChange}
                disabled={statusUpdateLoading}
                className={`py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  pendingStatus === "Converted"
                    ? "bg-green-600 hover:bg-green-700 focus:ring-green-500 disabled:bg-green-300"
                    : "bg-red-600 hover:bg-red-700 focus:ring-red-500 disabled:bg-red-300"
                }`}
              >
                {statusUpdateLoading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Updating...
                  </>
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditLeadForm;
