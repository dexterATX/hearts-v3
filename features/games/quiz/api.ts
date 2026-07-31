// features/games/quiz/api.ts — the only file in the quiz slice touching lib/db.
import { supabase } from '../../../lib/db/client';
import { ok, err, toAppError, type Result } from '../../../lib/result';
import type { QuizQuestionRow } from '../../../lib/db/database.types';

export async function fetchQuestions(coupleId: string): Promise<Result<QuizQuestionRow[]>> {
  try {
    const res = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (res.error) return err(toAppError(res.error, 'questions would not load'));
    return ok(res.data);
  } catch (e) {
    return err(toAppError(e, 'questions would not load'));
  }
}
