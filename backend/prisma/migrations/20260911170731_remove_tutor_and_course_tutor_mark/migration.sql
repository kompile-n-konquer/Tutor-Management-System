-- Remove the Tutor extension table and CourseTutorMark. TutorAssignment becomes the
-- User <-> Course join (userId + semester), and the remaining tutor-role tables
-- (BusyBlock, Timesheet, OverflowWork) point directly at User.

-- 1. CourseTutorMark is unused (marks live on Application rows)
DROP TABLE [dbo].[CourseTutorMark];

-- 2. TutorAssignment: tutorId (Tutor FK) -> userId (User FK); drop allocatedHours + status
ALTER TABLE [dbo].[TutorAssignment] ADD [userId] INT NULL;
UPDATE [dbo].[TutorAssignment] SET [userId] = t.[userId] FROM [dbo].[TutorAssignment] a JOIN [dbo].[Tutor] t ON a.[tutorId] = t.[id];
ALTER TABLE [dbo].[TutorAssignment] DROP CONSTRAINT [TutorAssignment_tutorId_fkey];
ALTER TABLE [dbo].[TutorAssignment] DROP COLUMN [tutorId];
ALTER TABLE [dbo].[TutorAssignment] DROP COLUMN [allocatedHours];
ALTER TABLE [dbo].[TutorAssignment] DROP COLUMN [status];
ALTER TABLE [dbo].[TutorAssignment] ALTER COLUMN [userId] INT NOT NULL;
ALTER TABLE [dbo].[TutorAssignment] ADD CONSTRAINT [TutorAssignment_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- 3. BusyBlock: tutorId -> userId (unique key rebuilt on the new column)
ALTER TABLE [dbo].[BusyBlock] ADD [userId] INT NULL;
UPDATE [dbo].[BusyBlock] SET [userId] = t.[userId] FROM [dbo].[BusyBlock] b JOIN [dbo].[Tutor] t ON b.[tutorId] = t.[id];
ALTER TABLE [dbo].[BusyBlock] DROP CONSTRAINT [BusyBlock_tutorId_dayOfWeek_startMinute_endMinute_key];
ALTER TABLE [dbo].[BusyBlock] DROP CONSTRAINT [BusyBlock_tutorId_fkey];
ALTER TABLE [dbo].[BusyBlock] DROP COLUMN [tutorId];
ALTER TABLE [dbo].[BusyBlock] ALTER COLUMN [userId] INT NOT NULL;
ALTER TABLE [dbo].[BusyBlock] ADD CONSTRAINT [BusyBlock_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE [dbo].[BusyBlock] ADD CONSTRAINT [BusyBlock_userId_dayOfWeek_startMinute_endMinute_key] UNIQUE NONCLUSTERED ([userId],[dayOfWeek],[startMinute],[endMinute]);

-- 4. Timesheet: tutorId -> userId
ALTER TABLE [dbo].[Timesheet] ADD [userId] INT NULL;
UPDATE [dbo].[Timesheet] SET [userId] = t.[userId] FROM [dbo].[Timesheet] ts JOIN [dbo].[Tutor] t ON ts.[tutorId] = t.[id];
ALTER TABLE [dbo].[Timesheet] DROP CONSTRAINT [Timesheet_tutorId_fkey];
ALTER TABLE [dbo].[Timesheet] DROP COLUMN [tutorId];
ALTER TABLE [dbo].[Timesheet] ALTER COLUMN [userId] INT NOT NULL;
ALTER TABLE [dbo].[Timesheet] ADD CONSTRAINT [Timesheet_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- 5. OverflowWork: claimedBy re-pointed from Tutor to User
UPDATE [dbo].[OverflowWork] SET [claimedBy] = t.[userId] FROM [dbo].[OverflowWork] o JOIN [dbo].[Tutor] t ON o.[claimedBy] = t.[id] WHERE o.[claimedBy] IS NOT NULL;
ALTER TABLE [dbo].[OverflowWork] DROP CONSTRAINT [OverflowWork_claimedBy_fkey];
ALTER TABLE [dbo].[OverflowWork] ADD CONSTRAINT [OverflowWork_claimedBy_fkey] FOREIGN KEY ([claimedBy]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- 6. The tutor role now lives solely on User.role
DROP TABLE [dbo].[Tutor];
