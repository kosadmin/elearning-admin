import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://frykytmvjrvnmedlleuu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_F7RFkORLK6fMBV3ehovDKA_cQWm6-D-';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);