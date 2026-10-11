-- EventRegister: the event attendance register. One row per tutor the owning
-- lecturer marked present on the day; timesheet approval reads it to block
-- claims for events the tutor did not attend. The unique index keeps a tutor
-- from appearing twice on the same register.

-- CreateTable
CREATE TABLE [dbo].[EventRegister] (
    [id] INT NOT NULL IDENTITY,
    [eventId] INT NOT NULL,
    [userId] INT NOT NULL,
    [markedAt] DATETIME2(3) NOT NULL CONSTRAINT [EventRegister_markedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EventRegister_pkey] PRIMARY KEY ([id])
);

-- CreateIndex
CREATE UNIQUE INDEX [EventRegister_eventId_userId_key] ON [dbo].[EventRegister]([eventId], [userId]);

-- AddForeignKey
ALTER TABLE [dbo].[EventRegister] ADD CONSTRAINT [EventRegister_eventId_fkey] FOREIGN KEY ([eventId]) REFERENCES [dbo].[Event]([id]) ON UPDATE NO ACTION;

ALTER TABLE [dbo].[EventRegister] ADD CONSTRAINT [EventRegister_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON UPDATE NO ACTION;
