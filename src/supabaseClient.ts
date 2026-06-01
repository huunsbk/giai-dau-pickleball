import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://ykckqcykxfhpfqptckxk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_2pfQHPjlGmtgOgGO0qaHXA_zGrwUZwT";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
