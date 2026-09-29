-- Adds the SessionVolunteer table (excuse / volunteer feature, issue #37).
-- The other changes this migration used to carry (Availability and
-- TutorAssignment tutorId -> userId, Course budget columns) are either handled
-- by 20260911170731-33 or no longer match schema.prisma, so they were removed.

CREATE TABLE [dbo].[SessionVolunteer] (
    [id] INT NOT NULL IDENTITY(1,1),
    [sessionId] INT NOT NULL,
    [userId] INT NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [SessionVolunteer_status_df] DEFAULT 'PENDING',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SessionVolunteer_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [SessionVolunteer_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SessionVolunteer_sessionId_key] UNIQUE NONCLUSTERED ([sessionId])
);

-- AddForeignKey
ALTER TABLE [dbo].[SessionVolunteer] ADD CONSTRAINT [SessionVolunteer_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[Session]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[SessionVolunteer] ADD CONSTRAINT [SessionVolunteer_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
