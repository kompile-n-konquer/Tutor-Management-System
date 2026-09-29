-- Brings a migration-built database in line with schema.prisma:
-- 1. Adds the SessionVolunteer table (excuse / volunteer feature, issue #37).
-- 2. Fixes baseline drift: Availability is keyed by userId (not tutorId),
--    Course carries budgetHours/hourlyRate/requiredTutors (not budget), and
--    TutorAssignment gained a nullable tutorId plus applicantId.
BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[Availability] DROP CONSTRAINT [Availability_tutorId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[TutorAssignment] DROP CONSTRAINT [TutorAssignment_tutorId_fkey];

-- DropIndex
ALTER TABLE [dbo].[Availability] DROP CONSTRAINT [Availability_tutorId_dayOfWeek_timeSlotId_key];

-- AlterTable
ALTER TABLE [dbo].[Availability] DROP COLUMN [tutorId];
ALTER TABLE [dbo].[Availability] ADD [userId] INT NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[Course] DROP COLUMN [budget];
ALTER TABLE [dbo].[Course] ADD [budgetHours] FLOAT(53) NOT NULL CONSTRAINT [Course_budgetHours_df] DEFAULT 0,
[hourlyRate] FLOAT(53) NOT NULL CONSTRAINT [Course_hourlyRate_df] DEFAULT 0,
[requiredTutors] INT NOT NULL CONSTRAINT [Course_requiredTutors_df] DEFAULT 1;

-- AlterTable
ALTER TABLE [dbo].[TutorAssignment] ALTER COLUMN [tutorId] INT NULL;
ALTER TABLE [dbo].[TutorAssignment] ADD [applicantId] INT;

-- CreateTable
CREATE TABLE [dbo].[SessionVolunteer] (
    [id] INT NOT NULL IDENTITY(1,1),
    [sessionId] INT NOT NULL,
    [userId] INT NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [SessionVolunteer_status_df] DEFAULT 'PENDING',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SessionVolunteer_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [SessionVolunteer_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SessionVolunteer_sessionId_key] UNIQUE NONCLUSTERED ([sessionId])
);

-- CreateIndex
ALTER TABLE [dbo].[Availability] ADD CONSTRAINT [Availability_userId_dayOfWeek_timeSlotId_key] UNIQUE NONCLUSTERED ([userId], [dayOfWeek], [timeSlotId]);

-- CreateIndex
ALTER TABLE [dbo].[TutorAssignment] ADD CONSTRAINT [TutorAssignment_applicantId_key] UNIQUE NONCLUSTERED ([applicantId]);

-- AddForeignKey
ALTER TABLE [dbo].[TutorAssignment] ADD CONSTRAINT [TutorAssignment_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TutorAssignment] ADD CONSTRAINT [TutorAssignment_applicantId_fkey] FOREIGN KEY ([applicantId]) REFERENCES [dbo].[Applicant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Availability] ADD CONSTRAINT [Availability_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[SessionVolunteer] ADD CONSTRAINT [SessionVolunteer_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[Session]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[SessionVolunteer] ADD CONSTRAINT [SessionVolunteer_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
