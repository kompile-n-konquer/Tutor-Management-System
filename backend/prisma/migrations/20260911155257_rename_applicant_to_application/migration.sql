-- Rename Applicant to Application: a row is a submitted tutor application, not a person/role
EXEC sp_rename 'Applicant', 'Application';

-- sp_rename only renames the table, so rename its constraints to match what
-- prisma db push expects (otherwise db push keeps reporting drift)
EXEC sp_rename 'Applicant_pkey', 'Application_pkey';
EXEC sp_rename 'Applicant_status_df', 'Application_status_df';
EXEC sp_rename 'Applicant_courseId_fkey', 'Application_courseId_fkey';
EXEC sp_rename 'Applicant_userId_fkey', 'Application_userId_fkey';

-- Drop the unused availability JSON snapshot: live availability covering an applied
-- course's slots is preserved by the application locks, so the snapshot was redundant
ALTER TABLE [dbo].[Application] DROP COLUMN [availability];
