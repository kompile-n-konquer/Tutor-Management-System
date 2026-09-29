-- Step 3 of the Tutor -> User refactor: drop the Tutor extension table and
-- CourseTutorMark. TutorAssignment becomes the User <-> Course join, and the
-- remaining tutor-role tables (BusyBlock, Timesheet, Availability,
-- OverflowWork) point directly at User.

-- 1. CourseTutorMark is unused (marks live on Application rows)
DROP TABLE [dbo].[CourseTutorMark];

-- 2. TutorAssignment: tutorId (Tutor FK) -> userId (User FK); drop allocatedHours + status
ALTER TABLE [dbo].[TutorAssignment] DROP CONSTRAINT [TutorAssignment_tutorId_fkey];
ALTER TABLE [dbo].[TutorAssignment] DROP COLUMN [tutorId];
ALTER TABLE [dbo].[TutorAssignment] DROP COLUMN [allocatedHours];
ALTER TABLE [dbo].[TutorAssignment] DROP COLUMN [status];
ALTER TABLE [dbo].[TutorAssignment] ALTER COLUMN [userId] INT NOT NULL;
ALTER TABLE [dbo].[TutorAssignment] ADD CONSTRAINT [TutorAssignment_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- 3. BusyBlock: tutorId -> userId (unique key rebuilt on the new column)
ALTER TABLE [dbo].[BusyBlock] DROP CONSTRAINT [BusyBlock_tutorId_dayOfWeek_startMinute_endMinute_key];
ALTER TABLE [dbo].[BusyBlock] DROP CONSTRAINT [BusyBlock_tutorId_fkey];
ALTER TABLE [dbo].[BusyBlock] DROP COLUMN [tutorId];
ALTER TABLE [dbo].[BusyBlock] ALTER COLUMN [userId] INT NOT NULL;
ALTER TABLE [dbo].[BusyBlock] ADD CONSTRAINT [BusyBlock_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE [dbo].[BusyBlock] ADD CONSTRAINT [BusyBlock_userId_dayOfWeek_startMinute_endMinute_key] UNIQUE NONCLUSTERED ([userId],[dayOfWeek],[startMinute],[endMinute]);

-- 4. Timesheet: tutorId -> userId
ALTER TABLE [dbo].[Timesheet] DROP CONSTRAINT [Timesheet_tutorId_fkey];
ALTER TABLE [dbo].[Timesheet] DROP COLUMN [tutorId];
ALTER TABLE [dbo].[Timesheet] ALTER COLUMN [userId] INT NOT NULL;
ALTER TABLE [dbo].[Timesheet] ADD CONSTRAINT [Timesheet_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- 5. Availability: tutorId -> userId (unique key rebuilt on the new column).
--    Without dropping this FK, DROP TABLE Tutor fails with error 3726.
ALTER TABLE [dbo].[Availability] DROP CONSTRAINT [Availability_tutorId_dayOfWeek_timeSlotId_key];
ALTER TABLE [dbo].[Availability] DROP CONSTRAINT [Availability_tutorId_fkey];
ALTER TABLE [dbo].[Availability] DROP COLUMN [tutorId];
ALTER TABLE [dbo].[Availability] ALTER COLUMN [userId] INT NOT NULL;
ALTER TABLE [dbo].[Availability] ADD CONSTRAINT [Availability_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE [dbo].[Availability] ADD CONSTRAINT [Availability_userId_dayOfWeek_timeSlotId_key] UNIQUE NONCLUSTERED ([userId],[dayOfWeek],[timeSlotId]);

-- 6. OverflowWork: claimedBy re-pointed from Tutor to User
ALTER TABLE [dbo].[OverflowWork] DROP CONSTRAINT [OverflowWork_claimedBy_fkey];
ALTER TABLE [dbo].[OverflowWork] ADD CONSTRAINT [OverflowWork_claimedBy_fkey] FOREIGN KEY ([claimedBy]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- 7. The tutor role now lives solely on User.role
DROP TABLE [dbo].[Tutor];
