-- Timesheet: change totalHours from Float to Int with a default,
-- and add name, createdAt, updatedAt columns.
-- Existing rows get safe placeholder values for NOT NULL columns that
-- lack a permanent default in the Prisma schema.

-- 1. Alter totalHours: FLOAT(53) -> INT, add DEFAULT 0
ALTER TABLE [dbo].[Timesheet] ALTER COLUMN [totalHours] INT NOT NULL;
ALTER TABLE [dbo].[Timesheet] ADD CONSTRAINT [Timesheet_totalHours_df] DEFAULT 0 FOR [totalHours];

-- 2. Add createdAt with a permanent default (Prisma @default(now()))
ALTER TABLE [dbo].[Timesheet] ADD [createdAt] DATETIME2 NOT NULL CONSTRAINT [Timesheet_createdAt_df] DEFAULT CURRENT_TIMESTAMP;

-- 3. Add name (NOT NULL, no permanent default) — temporary default for existing rows
ALTER TABLE [dbo].[Timesheet] ADD [name] NVARCHAR(1000) NOT NULL CONSTRAINT [Timesheet_name_tmp_df] DEFAULT N'Untitled';
ALTER TABLE [dbo].[Timesheet] DROP CONSTRAINT [Timesheet_name_tmp_df];

-- 4. Add updatedAt (NOT NULL, no permanent default) — temporary default for existing rows
ALTER TABLE [dbo].[Timesheet] ADD [updatedAt] DATETIME2 NOT NULL CONSTRAINT [Timesheet_updatedAt_tmp_df] DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE [dbo].[Timesheet] DROP CONSTRAINT [Timesheet_updatedAt_tmp_df];
