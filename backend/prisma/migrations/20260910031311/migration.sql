/*
  Warnings:

  - You are about to drop the column `tutorId` on the `Availability` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,dayOfWeek,timeSlotId]` on the table `Availability` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `Availability` table without a default value. This is not possible if the table is not empty.

*/
BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[Availability] DROP CONSTRAINT [Availability_tutorId_fkey];

-- DropIndex
ALTER TABLE [dbo].[Availability] DROP CONSTRAINT [Availability_tutorId_dayOfWeek_timeSlotId_key];

-- AlterTable
ALTER TABLE [dbo].[Availability] DROP COLUMN [tutorId];
ALTER TABLE [dbo].[Availability] ADD [userId] INT NOT NULL;

-- CreateIndex
ALTER TABLE [dbo].[Availability] ADD CONSTRAINT [Availability_userId_dayOfWeek_timeSlotId_key] UNIQUE NONCLUSTERED ([userId], [dayOfWeek], [timeSlotId]);

-- AddForeignKey
ALTER TABLE [dbo].[Availability] ADD CONSTRAINT [Availability_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
