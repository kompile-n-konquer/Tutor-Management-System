-- Add yearOfStudy column to User table (nullable, no default needed for SQL Server)
ALTER TABLE [dbo].[User] ADD [yearOfStudy] NVARCHAR(1000) NULL;
