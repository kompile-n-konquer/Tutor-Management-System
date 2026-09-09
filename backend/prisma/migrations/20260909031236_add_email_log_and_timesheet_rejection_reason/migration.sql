BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Timesheet] ADD [rejectionReason] NVARCHAR(1000);

-- CreateTable
CREATE TABLE [dbo].[EmailLog] (
    [id] INT NOT NULL IDENTITY(1,1),
    [eventType] NVARCHAR(1000) NOT NULL,
    [entityType] NVARCHAR(1000) NOT NULL,
    [entityId] INT NOT NULL,
    [dedupeKey] NVARCHAR(1000) NOT NULL,
    [recipientEmail] NVARCHAR(1000) NOT NULL,
    [recipientUserId] INT,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [EmailLog_status_df] DEFAULT 'PENDING',
    [subject] NVARCHAR(1000),
    [attemptedAt] DATETIME2 NOT NULL CONSTRAINT [EmailLog_attemptedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [sentAt] DATETIME2,
    [errorMessage] NVARCHAR(1000),
    CONSTRAINT [EmailLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmailLog_dedupeKey_status_idx] ON [dbo].[EmailLog]([dedupeKey], [status]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
