-- TimesheetEntry: link a claimed event to the entry it auto-created.
-- Applied statement-by-statement (db execute compiles whole files as one batch,
-- so the index on the new column cannot live in the same batch as the ADD).

-- 1. Add the nullable eventId column
ALTER TABLE [dbo].[TimesheetEntry] ADD [eventId] INT;

-- 2. Add FK constraint from TimesheetEntry.eventId to Event.id
ALTER TABLE [dbo].[TimesheetEntry] ADD CONSTRAINT [TimesheetEntry_eventId_fkey]
    FOREIGN KEY ([eventId]) REFERENCES [dbo].[Event]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- 3. An event can only be claimed once. Filtered unique index because SQL Server
--    treats NULLs as duplicates in plain unique indexes, which would block the
--    manual entries that have no event
CREATE UNIQUE INDEX [TimesheetEntry_eventId_key] ON [dbo].[TimesheetEntry]([eventId]) WHERE [eventId] IS NOT NULL;
