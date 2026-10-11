-- CreateTable
CREATE TABLE [dbo].[Transcript] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [fileName] NVARCHAR(1000) NOT NULL,
    [studentNumber] NVARCHAR(1000),
    [coursesJson] NVARCHAR(max) NOT NULL,
    [parsedAt] DATETIME2 NOT NULL CONSTRAINT [Transcript_parsedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Transcript_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Transcript_userId_key] UNIQUE NONCLUSTERED ([userId])
);

-- AddForeignKey
ALTER TABLE [dbo].[Transcript] ADD CONSTRAINT [Transcript_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;
