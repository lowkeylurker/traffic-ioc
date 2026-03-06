-- ==============================================================================
-- MIGRATION: Update dim_shift schema to use start_hour, end_hour
-- Date: 2026-03-02
-- Purpose: Support 7 shifts as per specification
-- ==============================================================================

-- Step 1: Rename old columns to backup
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'dim_shift' 
        AND column_name = 'start_minute'
    ) THEN
        -- Backup old data by renaming columns
        ALTER TABLE dim_shift RENAME COLUMN start_minute TO start_minute_old;
        ALTER TABLE dim_shift RENAME COLUMN end_minute TO end_minute_old;
        RAISE NOTICE 'Renamed old columns to backup';
    END IF;
END $$;

-- Step 2: Add new columns if they don't exist
ALTER TABLE dim_shift ADD COLUMN IF NOT EXISTS start_hour SMALLINT;
ALTER TABLE dim_shift ADD COLUMN IF NOT EXISTS end_hour SMALLINT;
ALTER TABLE dim_shift ADD COLUMN IF NOT EXISTS is_peak_hour BOOLEAN DEFAULT FALSE;

-- Step 3: Rename old is_business_shift to backup if exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'dim_shift' 
        AND column_name = 'is_business_shift'
    ) THEN
        ALTER TABLE dim_shift RENAME COLUMN is_business_shift TO is_business_shift_old;
        RAISE NOTICE 'Renamed is_business_shift column';
    END IF;
END $$;

-- Step 4: Drop old columns
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'dim_shift' 
        AND column_name = 'start_minute_old'
    ) THEN
        ALTER TABLE dim_shift DROP COLUMN start_minute_old;
        ALTER TABLE dim_shift DROP COLUMN end_minute_old;
        ALTER TABLE dim_shift DROP COLUMN is_business_shift_old;
        RAISE NOTICE 'Dropped old columns';
    END IF;
END $$;

-- Step 5: Verify final schema
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name='dim_shift'
ORDER BY ordinal_position;
