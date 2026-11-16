-- ==============================================================================
-- STUDY.IO: Fix Stale Carryover and Synchronize User Ranks
-- Resets contaminated season_base_rp to 0 and recalculates live season RP and rank
-- ==============================================================================

-- 1. Reset trial (5h 05m = 18,316s => 508 RP => Bronze II)
UPDATE public.profiles
SET 
  season_base_rp = 0,
  season_rp = 508,
  current_rank = 'Bronze II',
  rank_title = 'Bronze II',
  rank_badge = 'bronze-2.png'
WHERE username = 'trial';

-- 2. Reset wren (0h 53m = 3,223s => 89 RP => Bronze I)
UPDATE public.profiles
SET 
  season_base_rp = 0,
  season_rp = 89,
  current_rank = 'Bronze I',
  rank_title = 'Bronze I',
  rank_badge = 'bronze-1.png'
WHERE username = 'wren';

-- 3. Reset abby (0h = 0 RP => Bronze I)
UPDATE public.profiles
SET 
  season_base_rp = 0,
  season_rp = 0,
  current_rank = 'Bronze I',
  rank_title = 'Bronze I',
  rank_badge = 'bronze-1.png'
WHERE username = 'abby';

-- 4. Verify updated ranks
SELECT 
  username, 
  season_base_rp, 
  season_rp, 
  rank_title, 
  current_rank, 
  rank_badge 
FROM public.profiles 
WHERE username IN ('trial', 'wren', 'abby');
