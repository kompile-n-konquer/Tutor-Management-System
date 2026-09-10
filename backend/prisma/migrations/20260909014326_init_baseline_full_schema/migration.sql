BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[User] (
    [id] INT NOT NULL IDENTITY(1,1),
    [studentNumber] NVARCHAR(1000),
    [employeeNumber] NVARCHAR(1000),
    [firstName] NVARCHAR(1000) NOT NULL,
    [lastName] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [phoneNumber] NVARCHAR(1000),
    [role] NVARCHAR(1000) NOT NULL CONSTRAINT [User_role_df] DEFAULT 'STUDENT',
    [isActive] BIT NOT NULL CONSTRAINT [User_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [firebaseUid] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_email_key] UNIQUE NONCLUSTERED ([email]),
    CONSTRAINT [User_firebaseUid_key] UNIQUE NONCLUSTERED ([firebaseUid])
);

-- CreateTable
CREATE TABLE [dbo].[Tutor] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [hourlyRate] FLOAT(53),
    [maxHoursPerWeek] INT NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [approvedAt] DATETIME2,
    CONSTRAINT [Tutor_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Tutor_userId_key] UNIQUE NONCLUSTERED ([userId])
);

-- CreateTable
CREATE TABLE [dbo].[Lecturer] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [department] NVARCHAR(1000) NOT NULL,
    [officeLocation] NVARCHAR(1000),
    [officeHours] NVARCHAR(1000),
    CONSTRAINT [Lecturer_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Lecturer_userId_key] UNIQUE NONCLUSTERED ([userId])
);

-- CreateTable
CREATE TABLE [dbo].[Applicant] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [courseId] INT NOT NULL,
    [courseMark] FLOAT(53) NOT NULL,
    [transcriptPath] NVARCHAR(1000),
    [availability] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Applicant_status_df] DEFAULT 'PENDING',
    [appliedAt] DATETIME2 NOT NULL CONSTRAINT [Applicant_appliedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [reviewedAt] DATETIME2,
    CONSTRAINT [Applicant_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Course] (
    [id] INT NOT NULL IDENTITY(1,1),
    [courseCode] NVARCHAR(1000) NOT NULL,
    [courseName] NVARCHAR(1000) NOT NULL,
    [minimumMark] FLOAT(53) NOT NULL,
    [budget] FLOAT(53),
    [lecturerId] INT NOT NULL,
    CONSTRAINT [Course_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Course_courseCode_key] UNIQUE NONCLUSTERED ([courseCode])
);

-- CreateTable
CREATE TABLE [dbo].[CourseTutorMark] (
    [id] INT NOT NULL IDENTITY(1,1),
    [tutorId] INT NOT NULL,
    [courseId] INT NOT NULL,
    [mark] FLOAT(53) NOT NULL,
    CONSTRAINT [CourseTutorMark_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CourseTutorMark_tutorId_courseId_key] UNIQUE NONCLUSTERED ([tutorId],[courseId])
);

-- CreateTable
CREATE TABLE [dbo].[TutorAssignment] (
    [id] INT NOT NULL IDENTITY(1,1),
    [tutorId] INT NOT NULL,
    [courseId] INT NOT NULL,
    [allocatedHours] INT NOT NULL,
    [semester] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [TutorAssignment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TimeSlot] (
    [id] INT NOT NULL IDENTITY(1,1),
    [startMinute] INT NOT NULL,
    [endMinute] INT NOT NULL,
    CONSTRAINT [TimeSlot_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TimeSlot_startMinute_endMinute_key] UNIQUE NONCLUSTERED ([startMinute],[endMinute])
);

-- CreateTable
CREATE TABLE [dbo].[Availability] (
    [id] INT NOT NULL IDENTITY(1,1),
    [tutorId] INT NOT NULL,
    [dayOfWeek] INT NOT NULL,
    [timeSlotId] INT NOT NULL,
    CONSTRAINT [Availability_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Availability_tutorId_dayOfWeek_timeSlotId_key] UNIQUE NONCLUSTERED ([tutorId],[dayOfWeek],[timeSlotId])
);

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

-- CreateTable
CREATE TABLE [dbo].[Timesheet] (
    [id] INT NOT NULL IDENTITY(1,1),
    [tutorId] INT NOT NULL,
    [payrollNumber] NVARCHAR(1000),
    [totalHours] FLOAT(53) NOT NULL,
    [totalAmount] FLOAT(53),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Timesheet_status_df] DEFAULT 'DRAFT',
    [submittedAt] DATETIME2,
    [approvedAt] DATETIME2,
    CONSTRAINT [Timesheet_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TimesheetEntry] (
    [id] INT NOT NULL IDENTITY(1,1),
    [timesheetId] INT NOT NULL,
    [courseId] INT NOT NULL,
    [workDate] DATETIME2 NOT NULL,
    [startTime] DATETIME2 NOT NULL,
    [endTime] DATETIME2 NOT NULL,
    [duration] FLOAT(53) NOT NULL,
    [taskType] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000) NOT NULL,
    [supervisor] NVARCHAR(1000) NOT NULL,
    [isApproved] BIT NOT NULL CONSTRAINT [TimesheetEntry_isApproved_df] DEFAULT 0,
    CONSTRAINT [TimesheetEntry_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Session] (
    [id] INT NOT NULL IDENTITY(1,1),
    [assignmentId] INT NOT NULL,
    [date] DATETIME2 NOT NULL,
    [courseSlotId] INT NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Session_status_df] DEFAULT 'SCHEDULED',
    [excuseReason] NVARCHAR(1000),
    CONSTRAINT [Session_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CourseSlot] (
    [id] INT NOT NULL IDENTITY(1,1),
    [courseId] INT NOT NULL,
    [dayOfWeek] INT NOT NULL,
    [timeSlotId] INT NOT NULL,
    [venue] NVARCHAR(1000),
    [sessionType] NVARCHAR(1000),
    CONSTRAINT [CourseSlot_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[OverflowWork] (
    [id] INT NOT NULL IDENTITY(1,1),
    [courseId] INT NOT NULL,
    [description] NVARCHAR(1000) NOT NULL,
    [hours] INT NOT NULL,
    [postedBy] INT NOT NULL,
    [claimedBy] INT,
    [status] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [OverflowWork_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CourseSlot_courseId_dayOfWeek_idx] ON [dbo].[CourseSlot]([courseId], [dayOfWeek]);

-- AddForeignKey
ALTER TABLE [dbo].[Tutor] ADD CONSTRAINT [Tutor_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Lecturer] ADD CONSTRAINT [Lecturer_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Applicant] ADD CONSTRAINT [Applicant_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[Course]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Applicant] ADD CONSTRAINT [Applicant_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Course] ADD CONSTRAINT [Course_lecturerId_fkey] FOREIGN KEY ([lecturerId]) REFERENCES [dbo].[Lecturer]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CourseTutorMark] ADD CONSTRAINT [CourseTutorMark_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CourseTutorMark] ADD CONSTRAINT [CourseTutorMark_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[Course]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TutorAssignment] ADD CONSTRAINT [TutorAssignment_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[Course]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TutorAssignment] ADD CONSTRAINT [TutorAssignment_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Availability] ADD CONSTRAINT [Availability_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Availability] ADD CONSTRAINT [Availability_timeSlotId_fkey] FOREIGN KEY ([timeSlotId]) REFERENCES [dbo].[TimeSlot]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[BusyBlock] ADD CONSTRAINT [BusyBlock_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Timesheet] ADD CONSTRAINT [Timesheet_tutorId_fkey] FOREIGN KEY ([tutorId]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TimesheetEntry] ADD CONSTRAINT [TimesheetEntry_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[Course]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TimesheetEntry] ADD CONSTRAINT [TimesheetEntry_timesheetId_fkey] FOREIGN KEY ([timesheetId]) REFERENCES [dbo].[Timesheet]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Session] ADD CONSTRAINT [Session_assignmentId_fkey] FOREIGN KEY ([assignmentId]) REFERENCES [dbo].[TutorAssignment]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Session] ADD CONSTRAINT [Session_courseSlotId_fkey] FOREIGN KEY ([courseSlotId]) REFERENCES [dbo].[CourseSlot]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CourseSlot] ADD CONSTRAINT [CourseSlot_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[Course]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CourseSlot] ADD CONSTRAINT [CourseSlot_timeSlotId_fkey] FOREIGN KEY ([timeSlotId]) REFERENCES [dbo].[TimeSlot]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[OverflowWork] ADD CONSTRAINT [OverflowWork_claimedBy_fkey] FOREIGN KEY ([claimedBy]) REFERENCES [dbo].[Tutor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OverflowWork] ADD CONSTRAINT [OverflowWork_courseId_fkey] FOREIGN KEY ([courseId]) REFERENCES [dbo].[Course]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
