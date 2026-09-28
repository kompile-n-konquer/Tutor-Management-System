-- Drop columns from TimesheetEntry
ALTER TABLE [TimesheetEntry] DROP COLUMN [isApproved];
ALTER TABLE [TimesheetEntry] DROP COLUMN [taskType];
ALTER TABLE [TimesheetEntry] DROP COLUMN [startTime];
ALTER TABLE [TimesheetEntry] DROP COLUMN [endTime];

-- Drop totalAmount from Timesheet
ALTER TABLE [Timesheet] DROP COLUMN [totalAmount];

-- Add rejectionReason to Timesheet
ALTER TABLE [Timesheet] ADD [rejectionReason] NVARCHAR(1000);

-- Replace supervisor (String) with supervisorId (Int) FK to User
ALTER TABLE [TimesheetEntry] DROP COLUMN [supervisor];
ALTER TABLE [TimesheetEntry] ADD [supervisorId] INT NOT NULL DEFAULT 0;

-- Add status column to TimesheetEntry
ALTER TABLE [TimesheetEntry] ADD [status] NVARCHAR(1000) NOT NULL DEFAULT 'PENDING';

-- Add FK constraint from TimesheetEntry.supervisorId to User.id
ALTER TABLE [TimesheetEntry] ADD CONSTRAINT [TimesheetEntry_supervisorId_fkey]
    FOREIGN KEY ([supervisorId]) REFERENCES [User]([id]);
