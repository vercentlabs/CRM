import React, { useState, useEffect, useMemo } from "react";
import api from "@/lib/api";
import { extractData } from "@/lib/response";
import { useAuth } from "@/context/AuthContext";
import { ROLE_ADMIN } from "@/lib/constants";

/**
 * EditLocationForm component - Form for editing an existing location (Admin only)
 * @param {Object} props - Component props
 * @param {Object} props.location - The location object to edit
 * @param {Function} props.onSubmit - Function to call when form is submitted
 * @param {Function} props.onCancel - Function to call when form is cancelled
 */
const EditLocationForm = ({ location, onSubmit, onCancel }) => {
  const { user, token } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [managers, setManagers] = useState([]);

  // Initialize form data directly from props using useMemo
  const initialFormData = useMemo(
    () => ({
      name: location?.name || "",
      address: location?.address || "",
      city: location?.city || "",
      state: location?.state || "",
      pin_code: location?.pin_code || "",
      manager_id: location?.manager_id || "",
    }),
    [location],
  );

  // Form state
  const [formData, setFormData] = useState(initialFormData);

  // Fetch managers for dropdown
  useEffect(() => {
    const fetchManagers = async () => {
      try {
        const response = await api.get("/users/managers");
        const data = extractData(response);
        setManagers(data.managers || []);
      } catch (err) {
        console.error("Failed to fetch managers:", err);
        // Still allow form submission even if managers fail to load
      }
    };

    if (token) {
      fetchManagers();
    }
  }, [token]);

  // Reset form when location changes - using a ref to track changes
  // Update form data when location prop changes
  useEffect(() => {
    if (location) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        name: location.name || "",
        address: location.address || "",
        city: location.city || "",
        state: location.state || "",
        pin_code: location.pin_code || "",
        manager_id: location.manager_id || "",
      });
    }
  }, [location]);

  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Check if user has permission to edit locations
    if (user?.roleId !== ROLE_ADMIN) {
      setError("You do not have permission to edit locations.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.put(
        `/sales-locations/${location.id}`,
        formData,
      );
      const data = extractData(response);
      setIsLoading(false);
      if (onSubmit) onSubmit(data.location);
    } catch (err) {
      setIsLoading(false);
      if (err.response?.status === 401) {
        setError("Your session has expired. Please log in again.");
      } else if (err.response?.status === 403) {
        setError("You do not have permission to update locations.");
      } else if (err.response?.status >= 500) {
        setError("Server error. Please try again later.");
      } else {
        setError(
          err.response?.data?.message ||
            "Failed to update location. Please try again.",
        );
      }
      console.error("Failed to update location:", err);
    }
  };

  // Only render if user is an admin
  if (user?.roleId !== ROLE_ADMIN) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4">
        <div className="flex">
          <div className="ml-3">
            <p className="text-sm text-red-700">
              You do not have permission to edit locations. This feature is
              available to administrators only.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Edit Location
        </h3>

        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            {/* Name Field */}
            <div className="sm:col-span-6">
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700"
              >
                Location Name
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  placeholder="Main Office"
                />
              </div>
            </div>

            {/* Address Field */}
            <div className="sm:col-span-6">
              <label
                htmlFor="address"
                className="block text-sm font-medium text-gray-700"
              >
                Address
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="address"
                  name="address"
                  required
                  value={formData.address}
                  onChange={handleInputChange}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  placeholder="123 Business Street"
                />
              </div>
            </div>

            {/* City Field */}
            <div className="sm:col-span-3">
              <label
                htmlFor="city"
                className="block text-sm font-medium text-gray-700"
              >
                City
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="city"
                  name="city"
                  required
                  value={formData.city}
                  onChange={handleInputChange}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  placeholder="New York"
                />
              </div>
            </div>

            {/* State Field */}
            <div className="sm:col-span-3">
              <label
                htmlFor="state"
                className="block text-sm font-medium text-gray-700"
              >
                State
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="state"
                  name="state"
                  required
                  value={formData.state}
                  onChange={handleInputChange}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  placeholder="NY"
                />
              </div>
            </div>

            {/* Pin Code Field */}
            <div className="sm:col-span-3">
              <label
                htmlFor="pin_code"
                className="block text-sm font-medium text-gray-700"
              >
                Pin Code
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="pin_code"
                  name="pin_code"
                  required
                  value={formData.pin_code}
                  onChange={handleInputChange}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  placeholder="10001"
                />
              </div>
            </div>

            {/* Manager Field */}
            <div className="sm:col-span-3">
              <label
                htmlFor="manager_id"
                className="block text-sm font-medium text-gray-700"
              >
                Manager
              </label>
              <div className="mt-1">
                <select
                  id="manager_id"
                  name="manager_id"
                  value={formData.manager_id}
                  onChange={handleInputChange}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                >
                  <option value="">Select a manager</option>
                  {managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-5">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onCancel}
                className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    Updating...
                  </>
                ) : (
                  "Update Location"
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditLocationForm;
