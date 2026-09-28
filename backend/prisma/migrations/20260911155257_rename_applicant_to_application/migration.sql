-- Rename Applicant to Application: a row is a submitted tutor application, not a person/role
EXEC sp_rename 'Applicant', 'Application';

-- Drop the unused availability JSON snapshot: live availability covering an applied
-- course's slots is preserved by the application locks, so the snapshot was redundant
ALTER TABLE [dbo].[Application] DROP COLUMN [availability];
