
import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.routes.js';

import adminRoutes from './routes/admin.routes.js';
import userRoutes from './routes/user.routes.js';
import leadRoutes from './routes/lead.routes.js';
import followupRoutes from './routes/followup.routes.js';
import callRoutes from './routes/call.routes.js';
import messageRoutes from './routes/message.routes.js';
import plivoRoutes from './routes/plivo.routes.js';
import customerRoutes from './routes/customer.routes.js';
import goldRoutes from './routes/gold.routes.js';
import reportRoutes from './routes/report.routes.js';
import auditRoutes from './routes/audit.routes.js';
import salesLocationRoutes from './routes/salesLocation.routes.js';
import opportunityRoutes from './routes/opportunity.routes.js';
import taskRoutes from './routes/task.routes.js';
import notesRoutes from './routes/notes.routes.js';
import calendarRoutes from './routes/calendar.routes.js';
import chatRoutes from './routes/chat.routes.js';
import leadMessageRoutes from './routes/lead-message.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import pool from './config/db.js';
import { requestContextMiddleware } from './platform/request-context.js';
import { createV1Router } from './platform/v1.js';
import { errorHandler } from './platform/http/error-handler.js';

const app = express();

// Do not advertise the framework in response headers
app.disable('x-powered-by');

// Request ID + async request context (must run first)
app.use(requestContextMiddleware);

// Enable JSON body parsing
app.use(express.json());

// Enable CORS
app.use(cors());

// Health check route (legacy, unversioned)
app.use('/health', healthRoutes);

// Versioned API (see docs/architecture/TARGET_SYSTEM.md)
app.use('/api/v1', createV1Router({ pool }));

// Authentication routes
app.use('/auth', authRoutes);


// Admin routes
app.use('/admin', adminRoutes);

// User routes
app.use('/users', userRoutes);

// Lead routes
app.use('/leads', leadRoutes);

// Followup routes
app.use('/followups', followupRoutes);

// Call routes
app.use('/calls', callRoutes);

// Message routes
app.use('/messages', messageRoutes);

// Plivo routes
app.use('/api/plivo', plivoRoutes);

// Customer routes
app.use('/customers', customerRoutes);

// Gold routes
app.use('/gold', goldRoutes);

// Report routes
app.use('/reports', reportRoutes);

// Audit routes
app.use('/audit', auditRoutes);

// Sales Location routes
app.use('/sales-locations', salesLocationRoutes);

// Opportunity routes
app.use('/opportunities', opportunityRoutes);

// Task routes
app.use('/tasks', taskRoutes);

// Notes routes
app.use('/notes', notesRoutes);

// Calendar routes
app.use('/calendar', calendarRoutes);

// Chat routes
app.use('/api/chat', chatRoutes);

// Lead message routes
app.use('/api/lead-messages', leadMessageRoutes);

// Settings routes
app.use('/settings', settingsRoutes);

// Upload routes
app.use('/api/upload', uploadRoutes);

// Central error handler: safe JSON errors, no stack traces, request ID attached
app.use(errorHandler);

export default app;
