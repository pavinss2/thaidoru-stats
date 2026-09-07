-- ==============================================================================
-- SQL Script: Patch & Synthesize Missing Follower Data Gaps in follower_history
-- Database: PostgreSQL (Neon / Vercel Postgres)
-- ==============================================================================
--
-- Description:
--   1. Automatically identifies missing date gaps in `follower_history` for each idol & platform.
--   2. For 1-day gaps: Synthesizes a random follower count bounded between the previous day and next day.
--   3. For Multi-day gaps (>1 day): Uses proportional linear interpolation with daily random jitter (+/- 2 followers).
--   4. Uses ON CONFLICT (date, idol_name, platform) DO UPDATE to prevent key collision errors.
--
-- How to run:
--   - Execute in Neon SQL Console, Vercel Postgres SQL Studio, or via psql.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SINGLE-DAY GAP PATCH (Missing exactly 1 day in between)
-- ------------------------------------------------------------------------------
WITH date_gaps AS (
    SELECT 
        idol_name,
        platform,
        username,
        date AS prev_date,
        follower_count AS prev_count,
        LEAD(date) OVER (PARTITION BY idol_name, platform ORDER BY date ASC) AS next_date,
        LEAD(follower_count) OVER (PARTITION BY idol_name, platform ORDER BY date ASC) AS next_count
    FROM follower_history
),
single_day_missing AS (
    SELECT 
        (prev_date + INTERVAL '1 day')::DATE AS missing_date,
        TIME '12:00:00' AS timestamp,
        idol_name,
        platform,
        username,
        -- Pick a random integer between prev_count and next_count (inclusive)
        (LEAST(prev_count, next_count) + FLOOR(random() * (ABS(next_count - prev_count) + 1)))::INT AS follower_count
    FROM date_gaps
    WHERE (next_date - prev_date) = 2 -- Exactly 1 missing day in between
)
INSERT INTO follower_history (date, timestamp, idol_name, platform, username, follower_count)
SELECT missing_date, timestamp, idol_name, platform, username, follower_count
FROM single_day_missing
ON CONFLICT (date, idol_name, platform) DO UPDATE
SET follower_count = EXCLUDED.follower_count,
    username = EXCLUDED.username,
    timestamp = EXCLUDED.timestamp;


-- ------------------------------------------------------------------------------
-- 2. COMPREHENSIVE PATCH FOR ALL GAPS (Single-Day & Multi-Day Gaps)
-- ------------------------------------------------------------------------------
WITH date_gaps AS (
    SELECT 
        idol_name,
        platform,
        username,
        date AS prev_date,
        follower_count AS prev_count,
        LEAD(date) OVER (PARTITION BY idol_name, platform ORDER BY date ASC) AS next_date,
        LEAD(follower_count) OVER (PARTITION BY idol_name, platform ORDER BY date ASC) AS next_count
    FROM follower_history
),
gaps_to_fill AS (
    SELECT 
        g.idol_name,
        g.platform,
        g.username,
        g.prev_date,
        g.prev_count,
        g.next_date,
        g.next_count,
        (g.next_date - g.prev_date) AS total_days,
        series.missing_date::DATE AS missing_date,
        (series.missing_date::DATE - g.prev_date) AS day_offset
    FROM date_gaps g,
    LATERAL generate_series(g.prev_date + INTERVAL '1 day', g.next_date - INTERVAL '1 day', INTERVAL '1 day') AS series(missing_date)
    WHERE (g.next_date - g.prev_date) > 1
),
interpolated_records AS (
    SELECT
        missing_date,
        TIME '12:00:00' AS timestamp,
        idol_name,
        platform,
        username,
        CASE 
            -- Single-day gap: Random integer between prev_count and next_count
            WHEN total_days = 2 THEN 
                (LEAST(prev_count, next_count) + FLOOR(random() * (ABS(next_count - prev_count) + 1)))::INT
            
            -- Multi-day gap: Linear baseline + small random jitter (+/- 2 followers) bounded within [prev_count, next_count]
            ELSE 
                GREATEST(
                    LEAST(prev_count, next_count),
                    LEAST(
                        GREATEST(prev_count, next_count),
                        ROUND(
                            prev_count + (next_count - prev_count)::NUMERIC * day_offset / total_days
                            + (random() * 4 - 2) -- Small random daily jitter (-2 to +2)
                        )::INT
                    )
                )
        END AS follower_count
    FROM gaps_to_fill
)
INSERT INTO follower_history (date, timestamp, idol_name, platform, username, follower_count)
SELECT missing_date, timestamp, idol_name, platform, username, follower_count
FROM interpolated_records
ON CONFLICT (date, idol_name, platform) DO UPDATE
SET follower_count = EXCLUDED.follower_count,
    username = EXCLUDED.username,
    timestamp = EXCLUDED.timestamp;
