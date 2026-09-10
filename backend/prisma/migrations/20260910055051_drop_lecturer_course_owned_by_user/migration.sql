BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[Course] DROP CONSTRAINT [Course_lecturerId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[Lecturer] DROP CONSTRAINT [Lecturer_userId_fkey];

-- AlterTable
ALTER TABLE [dbo].[Course] DROP COLUMN [lecturerId];
ALTER TABLE [dbo].[Course] ADD [userId] INT NOT NULL;

-- DropTable
DROP TABLE [dbo].[Lecturer];

-- AddForeignKey
ALTER TABLE [dbo].[Course] ADD CONSTRAINT [Course_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
