-- CreateTable
CREATE TABLE [dbo].[RoleApplication] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [requestedRole] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [RoleApplication_status_df] DEFAULT 'PENDING',
    [submittedAt] DATETIME2 NOT NULL CONSTRAINT [RoleApplication_submittedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [reviewedAt] DATETIME2,
    [reviewedById] INT,
    [hourlyRate] FLOAT(53),
    [maxHoursPerWeek] INT,
    [department] NVARCHAR(1000),
    [officeLocation] NVARCHAR(1000),
    [officeHours] NVARCHAR(1000),
    [rejectionReason] NVARCHAR(1000),
    CONSTRAINT [RoleApplication_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RoleApplication_userId_requestedRole_status_key] UNIQUE NONCLUSTERED ([userId],[requestedRole],[status])
);

-- AddForeignKey
ALTER TABLE [dbo].[RoleApplication] ADD CONSTRAINT [RoleApplication_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;
