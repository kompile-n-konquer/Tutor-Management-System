-- TimesheetEntry: link a claimed event to the entry it auto-created.
-- SQL Server compiles each migration as one batch, so the FK and unique index
-- on the new column cannot live in the same batch as the ADD COLUMN
-- (error 207); they run in 20260912130001.

-- 1. Add the nullable eventId column
ALTER TABLE [dbo].[TimesheetEntry] ADD [eventId] INT;
