# Supabase Migration - Add Notes Column

## How to Apply This Migration

### Step 1: Open Supabase SQL Editor
1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Click on **SQL Editor** in the left sidebar
4. Click **New Query**

### Step 2: Copy and Paste the Migration
Copy the entire SQL script from `SUPABASE_MIGRATION.sql` and paste it into the SQL Editor.

The script will:
- Add a `notes` column (TEXT type) to the `companies` table
- Add a `notes` column (TEXT type) to the `suppliers` table
- Add helpful comments to describe the new columns

### Step 3: Execute the Migration
Click the **Run** button (or press `Ctrl+Enter`/`Cmd+Enter`)

You should see a success message: `Query succeeded in Xs`

### Step 4: Verify the Changes
You can verify the columns were added by:
1. Going to **Table Editor**
2. Selecting the `companies` table → you should see the `notes` column
3. Selecting the `suppliers` table → you should see the `notes` column

---

## What Changed in Your App

The app now supports:
- **Edit Modal**: When clicking Edit on Companies or Suppliers, users can now fill in notes
- **Save to Database**: Notes are saved to the cloud via the updated Supabase schema
- **Full CRUD**: Users can create, read, update, and delete notes for each company/supplier

## Rollback (if needed)

If you need to undo this migration:

```sql
ALTER TABLE companies DROP COLUMN notes;
ALTER TABLE suppliers DROP COLUMN notes;
```

Run this in the same SQL Editor if you need to revert the changes.
