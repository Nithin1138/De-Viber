import { supabase } from '../lib/supabaseClient';

// BAD: Fetches a post by ID without checking ownership
export async function getPostById(postId: string) {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (error) throw error;
  return data;
}

// BAD: Deletes a post by ID without checking ownership
export async function deletePost(postId: string) {
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId);

  if (error) throw error;
}

// GOOD: This one correctly filters by user_id too
export async function getUserPost(postId: string, userId: string) {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .eq('user_id', userId)
    .single();

  if (error) throw error;
  return data;
}
