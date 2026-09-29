-- TimesheetEntry: constraints for the eventId column added by
-- 20260912130000 (separate batch so the column is visible to the compiler).

-- 2. Add FK constraint from TimesheetEntry.eventId to Event.id
ALTER TABLE [dbo].[TimesheetEntry] ADD CONSTRAINT [TimesheetEntry_eventId_fkey]
    FOREIGN KEY ([eventId]) REFERENCES [dbo].[Event]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- 3. An event can only be claimed once. Plain unique constraint matching
--    what prisma db push generates for the schema's @unique
ALTER TABLE [dbo].[TimesheetEntry] ADD CONSTRAINT [TimesheetEntry_eventId_key] UNIQUE NONCLUSTERED ([eventId]);
