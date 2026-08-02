// features/games/quiz/ui/QuizScreen.tsx — how well do you know me, scored together.
import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Text, Button, Card, Input, Icon, Skeleton, SkeletonCard } from '../../../../ui';
import { colors, spacing, radius } from '../../../../theme/theme';
import { useQuiz, useAddQuestion } from '../hooks';
import { useSession, usePartnerName } from '../../../../lib/session/store';

/** One option row's height while we wait — keeps the layout from jumping. */
const OPTION_SKELETON_HEIGHT = spacing.huge + spacing.md;

function AddQuestionCard() {
  const add = useAddQuestion();
  const partnerName = usePartnerName();
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [answerIndex, setAnswerIndex] = useState(0);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const filled = options.map((o) => o.trim()).filter(Boolean);
    if (!prompt.trim() || filled.length < 2) return;
    await add(prompt.trim(), filled, Math.min(answerIndex, filled.length - 1));
    setPrompt('');
    setOptions(['', '', '', '']);
    setAnswerIndex(0);
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };

  return (
    <Card style={{ marginBottom: spacing.xl, gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="heading">write a question about yourself</Text>
        <Text variant="small" color={colors.muted}>
          {partnerName} answers it — and you answer theirs. one score for both of you.
        </Text>
      </View>

      <Input placeholder="my favorite…" value={prompt} onChangeText={setPrompt} />

      <View style={{ gap: spacing.sm }}>
        {options.map((opt, i) => {
          const isTruth = answerIndex === i;
          return (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Pressable
                onPress={() => setAnswerIndex(i)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isTruth }}
                accessibilityLabel={`option ${i + 1} — the truth`}
                hitSlop={spacing.sm}
              >
                <View
                  style={{
                    width: spacing.xl,
                    height: spacing.xl,
                    borderRadius: radius.pill,
                    borderWidth: 3,
                    borderColor: isTruth ? colors.blue : colors.lineBright,
                    backgroundColor: isTruth ? colors.blue : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isTruth ? <Icon name="check" size={spacing.lg} color={colors.onBlue} strokeWidth={2.2} /> : null}
                </View>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Input
                  placeholder={`option ${i + 1}${i === answerIndex ? ' (the truth)' : ''}`}
                  value={opt}
                  onChangeText={(t) => setOptions((prev) => prev.map((o, j) => (j === i ? t : o)))}
                />
              </View>
            </View>
          );
        })}
      </View>

      <Button
        label={done ? 'added ♥' : 'add it to the pile'}
        tone="secondary"
        icon={done ? 'check' : undefined}
        onPress={() => void submit()}
      />
    </Card>
  );
}

export function QuizScreen({ sessionId }: { sessionId: string }) {
  const game = useQuiz(sessionId);
  const partnerName = usePartnerName();
  const userId = useSession((s) => s.userId);

  if (game.loading || !game.state) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.xl }}>
        <SkeletonCard lines={2} />
        <View style={{ gap: spacing.sm }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={OPTION_SKELETON_HEIGHT} />
          ))}
        </View>
      </View>
    );
  }

  const s = game.state;

  if (game.outcome) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          justifyContent: 'center',
          padding: spacing.xl,
          gap: spacing.lg,
        }}
      >
        <Text variant="hero" color={colors.blue} style={{ textAlign: 'center' }}>
          {s.score} / {s.questions.length}
        </Text>
        <Text variant="title" style={{ textAlign: 'center' }}>
          {game.outcome.summary}
        </Text>
      </View>
    );
  }

  if (s.phase === 'lobby') {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.huge }}
      >
        <Text variant="title" style={{ marginBottom: spacing.xl }}>
          how well do you know me
        </Text>
        <AddQuestionCard />
        <Button
          label="deal a round of six"
          size="lg"
          haptic="medium"
          disabled={(game.questionBank.data?.length ?? 0) === 0}
          onPress={() => void game.begin(6)}
        />
        {(game.questionBank.data?.length ?? 0) === 0 ? (
          <Text variant="small" color={colors.muted} style={{ textAlign: 'center', marginTop: spacing.lg }}>
            add at least one question first — the pile grows over time
          </Text>
        ) : null}
      </ScrollView>
    );
  }

  const q = game.question;
  if (!q) return null;
  const myTurn = q.authorId !== userId;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl }}>
      <Text
        variant="overline"
        color={colors.muted}
        style={{ textAlign: 'center', textTransform: 'uppercase' }}
      >
        question {s.answers.length + 1} of {s.questions.length} · our score {s.score}
      </Text>

      <Card variant="raised" style={{ marginVertical: spacing.xl, padding: spacing.xl, gap: spacing.sm }}>
        <Text variant="overline" color={colors.blue} style={{ textTransform: 'uppercase' }}>
          about {q.authorId === userId ? 'you' : partnerName}
        </Text>
        <Text variant="title">{q.prompt}</Text>
      </Card>

      {myTurn ? (
        <View style={{ gap: spacing.sm }}>
          {q.options.map((opt, i) => (
            <Pressable key={i} accessibilityRole="button" onPress={() => void game.answer(q.id, i)}>
              {({ pressed }) => (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    borderWidth: 3,
                    borderColor: pressed ? colors.blue : colors.line,
                    borderRadius: radius.md,
                    padding: spacing.lg,
                    backgroundColor: pressed ? colors.blueSoft : colors.surfaceAlt,
                  }}
                >
                  <View
                    style={{
                      width: spacing.lg,
                      height: spacing.lg,
                      borderRadius: radius.pill,
                      borderWidth: 3,
                      borderColor: pressed ? colors.blue : colors.lineBright,
                      backgroundColor: pressed ? colors.blue : 'transparent',
                    }}
                  />
                  <Text variant="body" color={pressed ? colors.blue : colors.ink} style={{ flex: 1 }}>
                    {opt}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={{ gap: spacing.xl }}>
          <Text variant="body" color={colors.muted} style={{ textAlign: 'center' }}>
            {partnerName} is answering about you…
          </Text>
          <View style={{ gap: spacing.sm }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={OPTION_SKELETON_HEIGHT} />
            ))}
          </View>
        </View>
      )}

      {game.lastFailedMove ? (
        <Card variant="danger" style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Icon name="alert" size={spacing.lg} color={colors.danger} />
            <Text variant="small" color={colors.danger} style={{ flex: 1 }}>
              your answer did not reach {partnerName}’s phone
            </Text>
          </View>
          <Button label="answer again" tone="secondary" onPress={() => void game.retryFailed()} />
        </Card>
      ) : null}
    </View>
  );
}
