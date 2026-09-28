// SQL Server refuses to drop a column that still owns a default constraint,
// and `prisma db push` never drops those constraints itself. Without this
// script the deploy workflow fails with:
//   "The object 'TutorAssignment_status_df' is dependent on column 'status'."
//
// This drops every default constraint whose column no longer exists in
// schema.prisma — i.e. exactly the columns db push is about to remove.
// Constraints on tables that were dropped from the schema are left alone,
// because dropping a table removes its constraints too.
//
// Run right before `npx prisma db push` (see .gitea/workflows/deploy-app.yml).
// Pass --dry-run to only print what would be dropped.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

// table name -> Set of column names declared in schema.prisma
const schemaColumns = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [
    model.dbName || model.name,
    new Set(
      model.fields
        .filter((field) => field.kind === 'scalar')
        .map((field) => field.dbName || field.name)
    ),
  ])
);

async function main() {
  // Every default constraint in the database, with the table and column it
  // is attached to.
  const constraints = await prisma.$queryRaw`
    SELECT dc.name AS constraintName, t.name AS tableName, c.name AS columnName
    FROM sys.default_constraints dc
    JOIN sys.tables t ON t.object_id = dc.parent_object_id
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    ORDER BY t.name, c.name`;

  // Stale = the table still exists in schema.prisma but the column does not:
  // db push will drop that column, and the constraint would block it.
  const stale = constraints.filter((row) => {
    const columns = schemaColumns.get(row.tableName);
    return columns !== undefined && !columns.has(row.columnName);
  });

  if (stale.length === 0) {
    console.log('dropStaleDefaultConstraints: nothing to do.');
    return;
  }

  for (const { constraintName, tableName, columnName } of stale) {
    const dropSql = `ALTER TABLE [${bracketEscape(tableName)}] DROP CONSTRAINT [${bracketEscape(constraintName)}];`;
    if (dryRun) {
      console.log(`[dry-run] ${dropSql} (${tableName}.${columnName})`);
    } else {
      await prisma.$executeRawUnsafe(dropSql);
      console.log(`Dropped ${constraintName} from ${tableName} (was blocking removal of column ${columnName}).`);
    }
  }
}

function bracketEscape(identifier) {
  return String(identifier).replace(/]/g, ']]');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
