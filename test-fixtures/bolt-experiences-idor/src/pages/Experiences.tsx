import { supabase } from '../../lib/supabase';

export default function ExperiencesPage() {
  const handleDelete = async (id: string) => {
    // IDOR vulnerability: deletes experience directly by ID without filtering by user_id
    const { error } = await supabase.from('experiences').delete().eq('id', id);
    if (!error) {
      console.log('Deleted experience:', id);
    }
  };

  return (
    <div>
      <h1>Experiences</h1>
      <button onClick={() => handleDelete('123')}>Delete</button>
    </div>
  );
}
