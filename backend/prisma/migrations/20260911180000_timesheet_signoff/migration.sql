-- Drop columns from TimesheetEntry
-- SQL Server refuses to drop a column still bound by a default constraint
ALTER TABLE [TimesheetEntry] DROP CONSTRAINT [TimesheetEntry_isApproved_df];
ALTER TABLE [TimesheetEntry] DROP COLUMN [isApproved];
ALTER TABLE [TimesheetEntry] DROP COLUMN [taskType];
ALTER TABLE [TimesheetEntry] DROP COLUMN [startTime];
ALTER TABLE [TimesheetEntry] DROP COLUMN [endTime];

-- Drop totalAmount from Timesheet
ALTER TABLE [Timesheet] DROP COLUMN [totalAmount];

-- Add rejectionReason to Timesheet
ALTER TABLE [Timesheet] ADD [rejectionReason] NVARCHAR(1000);

-- Replace supervisor (String) with supervisorId (Int) FK to User.
-- Temporary default for existing rows, dropped so no constraint lingers
-- (schema.prisma has no default on supervisorId and db push expects none).
ALTER TABLE [TimesheetEntry] DROP COLUMN [supervisor];
ALTER TABLE [TimesheetEntry] ADD [supervisorId] INT NOT NULL CONSTRAINT [TimesheetEntry_supervisorId_tmp_df] DEFAULT 0;
ALTER TABLE [TimesheetEntry] DROP CONSTRAINT [TimesheetEntry_supervisorId_tmp_df];

-- Add status column to TimesheetEntry (named so db push sees no drift)
ALTER TABLE [TimesheetEntry] ADD [status] NVARCHAR(1000) NOT NULL CONSTRAINT [TimesheetEntry_status_df] DEFAULT 'PENDING';

-- Add FK constraint from TimesheetEntry.supervisorId to User.id
ALTER TABLE [TimesheetEntry] ADD CONSTRAINT [TimesheetEntry_supervisorId_fkey]
    FOREIGN KEY ([supervisorId]) REFERENCES [User]([id]);
