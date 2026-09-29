-- Key-value system configuration (e.g. TUTOR_MONTHLY_CLAIMABLE_HOURS)
CREATE TABLE [dbo].[SystemSetting] (
  [key] NVARCHAR(1000) NOT NULL,
  [value] NVARCHAR(1000) NOT NULL,
  [updatedAt] DATETIME2 NOT NULL,
  CONSTRAINT [SystemSetting_pkey] PRIMARY KEY CLUSTERED ([key])
);
