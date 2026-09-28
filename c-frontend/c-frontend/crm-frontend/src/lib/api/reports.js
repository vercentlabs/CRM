import api from '../api';

/**
 * Get all available reports
 * @returns {Promise} Promise object with reports data
 */
export const getReports = async () => {
  const response = await api.get('/reports');
  return response.data;
};

/**
 * Get dashboard summary
 * @returns {Promise} Promise object with dashboard summary data
 */
export const getDashboardSummary = async () => {
  const response = await api.get('/reports/dashboard-summary');
  return response.data;
};

/**
 * Get sales performance report
 * @returns {Promise} Promise object with sales performance data
 */
export const getSalesPerformance = async () => {
  const response = await api.get('/reports/sales-performance');
  return response.data;
};

/**
 * Get lead aging report
 * @returns {Promise} Promise object with lead aging data
 */
export const getLeadAging = async () => {
  const response = await api.get('/reports/lead-aging');
  return response.data;
};

/**
 * Get conversion report
 * @returns {Promise} Promise object with conversion funnel data
 */
export const getConversionReport = async () => {
  const response = await api.get('/reports/conversion-report');
  return response.data;
};

/**
 * Export leads as CSV
 * @returns {Promise} Promise object with CSV data
 */
export const exportLeadsCSV = async () => {
  const response = await api.get('/reports/export-leads-csv', {
    responseType: 'blob'
  });
  return response.data;
};
