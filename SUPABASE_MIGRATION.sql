-- Add notes column to companies table
ALTER TABLE companies ADD COLUMN notes TEXT;

-- Add notes column to suppliers table
ALTER TABLE suppliers ADD COLUMN notes TEXT;

-- Add comments documenting the new columns
COMMENT ON COLUMN companies.notes IS 'Additional notes or details about the company';
COMMENT ON COLUMN suppliers.notes IS 'Additional notes or details about the supplier';
