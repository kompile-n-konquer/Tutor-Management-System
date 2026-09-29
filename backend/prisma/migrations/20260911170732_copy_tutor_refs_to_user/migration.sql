-- Step 2 of the Tutor -> User refactor: copy Tutor.userId into the columns
-- added by 20260911170731. Runs in its own batch so the new columns are
-- visible to the compiler, and before the tutorId columns are dropped in
-- 20260911170733.

UPDATE [dbo].[TutorAssignment] SET [userId] = t.[userId] FROM [dbo].[TutorAssignment] a JOIN [dbo].[Tutor] t ON a.[tutorId] = t.[id];
UPDATE [dbo].[BusyBlock] SET [userId] = t.[userId] FROM [dbo].[BusyBlock] b JOIN [dbo].[Tutor] t ON b.[tutorId] = t.[id];
UPDATE [dbo].[Timesheet] SET [userId] = t.[userId] FROM [dbo].[Timesheet] ts JOIN [dbo].[Tutor] t ON ts.[tutorId] = t.[id];
UPDATE [dbo].[Availability] SET [userId] = t.[userId] FROM [dbo].[Availability] av JOIN [dbo].[Tutor] t ON av.[tutorId] = t.[id];
UPDATE [dbo].[OverflowWork] SET [claimedBy] = t.[userId] FROM [dbo].[OverflowWork] o JOIN [dbo].[Tutor] t ON o.[claimedBy] = t.[id] WHERE o.[claimedBy] IS NOT NULL;
