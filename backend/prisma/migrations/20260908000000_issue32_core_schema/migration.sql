-- Issue #32: Core Tutor, Course, Marks, Hours, Busy Times, and User Roles
-- Changes:
--   1. Tutor: drop static hour-tracking columns (availableHours, currentHours);
--      hours remaining is derived as maxHoursPerWeek - sum of assigned session durations for the week.
--   2. BusyBlock: new table for multiple per-tutor busy time ranges (day + minute-of-day range).

BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Tutor] DROP COLUMN [availableHours],
[currentHours];

-- CreateTable
CREATE TABLE [dbo].[BusyBlock] (
    [id] INT NOT NULL IDENTITY(1,1),
    [tutorId] INT NOT NULL,
    [dayOfWeek] INT NOT NULL,
    [startMinute] INT NOT NULL,
    [endMinute] INT NOT NULL,
    CONSTRAINT [BusyBlock_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [BusyBlock_tutorId_dayOfWeek_startMinute_endMinute_key] UNIQUE NONCLUSTERED ([tutorId],[dayOfWeek],[startMinute],[endMinute])
);

-- AddForeignKey
ALTER TABLE [dbo].[BusyBlock] ADD CONSTRAINT [BusyBlock_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
