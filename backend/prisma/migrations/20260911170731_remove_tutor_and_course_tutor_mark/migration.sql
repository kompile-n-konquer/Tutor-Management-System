-- Step 1 of the Tutor -> User refactor (see 20260911170732 and 20260911170733).
-- SQL Server compiles each migration as one batch, so an ADD COLUMN and the
-- UPDATE that fills it cannot live in the same batch (error 207). This
-- migration only adds the new columns; 20260911170732 copies the data and
-- 20260911170733 drops the old tutorId columns and the Tutor/CourseTutorMark
-- tables.

ALTER TABLE [dbo].[TutorAssignment] ADD [userId] INT NULL;
ALTER TABLE [dbo].[BusyBlock] ADD [userId] INT NULL;
ALTER TABLE [dbo].[Timesheet] ADD [userId] INT NULL;
ALTER TABLE [dbo].[Availability] ADD [userId] INT NULL;
